// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeadMansVault
 * @notice A time-locked vault that transfers funds to a backup address
 *         if the owner fails to "ping" within a specified interval.
 *
 * Flow:
 *  1. Owner calls createVault(backup, pingIntervalDays) with ETH attached.
 *  2. Owner must call ping() at least once every `pingInterval` seconds.
 *  3. If the owner misses the deadline, the backup calls claim(ownerAddress).
 *  4. Owner can always call withdraw() to reclaim funds while still active.
 */
contract DeadMansVault {

    // ─────────────────────────────────────────────────────────── structs ──

    struct Vault {
        address owner;
        address backup;
        uint256 balance;        // ETH held in the vault (wei)
        uint256 lastPingTime;   // Unix timestamp of the last successful ping
        uint256 pingInterval;   // Seconds the owner has between pings
        bool    claimed;        // True once the backup has withdrawn
        bool    active;         // False after withdraw() or claim()
    }

    // ───────────────────────────────────────────────────── state ──

    /// @dev owner address → Vault data
    mapping(address => Vault) public vaults;

    // ───────────────────────────────────────────────────── events ──

    event VaultCreated(
        address indexed owner,
        address indexed backup,
        uint256 pingIntervalSeconds,
        uint256 depositAmount
    );

    event Pinged(address indexed owner, uint256 newDeadline);

    event Claimed(
        address indexed backup,
        address indexed owner,
        uint256 amount
    );

    event Withdrawn(address indexed owner, uint256 amount);

    // ──────────────────────────────────────────────────── modifiers ──

    modifier onlyVaultOwner() {
        require(vaults[msg.sender].active, "No active vault found");
        require(vaults[msg.sender].owner == msg.sender, "Caller is not vault owner");
        _;
    }

    // ─────────────────────────────────────────────── core functions ──

    /**
     * @notice Create a new vault. Deposits msg.value ETH into the vault.
     * @param _backup           Address that can claim funds if owner goes inactive.
     * @param _pingIntervalDays How many days the owner has between pings (1–365).
     */
    function createVault(address _backup, uint256 _pingIntervalDays) external payable {
        require(!vaults[msg.sender].active,                        "Vault already exists");
        require(_backup != address(0),                             "Invalid backup address");
        require(_backup != msg.sender,                             "Backup cannot be the owner");
        require(msg.value > 0,                                     "Must deposit ETH");
        require(_pingIntervalDays >= 1 && _pingIntervalDays <= 365,"Interval must be 1–365 days");

        uint256 interval = _pingIntervalDays * 1 days;

        vaults[msg.sender] = Vault({
            owner:        msg.sender,
            backup:       _backup,
            balance:      msg.value,
            lastPingTime: block.timestamp,
            pingInterval: interval,
            claimed:      false,
            active:       true
        });

        emit VaultCreated(msg.sender, _backup, interval, msg.value);
    }

    /**
     * @notice Owner proves they are alive, resetting the countdown clock.
     */
    function ping() external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        require(!v.claimed, "Vault has already been claimed");

        v.lastPingTime = block.timestamp;

        emit Pinged(msg.sender, block.timestamp + v.pingInterval);
    }

    /**
     * @notice Backup address calls this after the owner's deadline has passed
     *         to withdraw all deposited funds.
     * @param _owner The vault owner's address.
     */
    function claim(address _owner) external {
        Vault storage v = vaults[_owner];

        require(v.active,                                           "No active vault for this owner");
        require(!v.claimed,                                         "Vault already claimed");
        require(msg.sender == v.backup,                            "Caller is not the backup address");
        require(block.timestamp > v.lastPingTime + v.pingInterval, "Owner is still within their ping window");

        v.claimed = true;
        v.active  = false;

        uint256 amount = v.balance;
        v.balance = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit Claimed(msg.sender, _owner, amount);
    }

    /**
     * @notice Owner voluntarily closes their vault and reclaims deposited ETH.
     */
    function withdraw() external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        require(!v.claimed, "Vault already claimed by backup");

        v.active = false;

        uint256 amount = v.balance;
        v.balance = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ──────────────────────────────────────────────────── view helpers ──

    /**
     * @notice Returns full vault details plus derived time fields.
     */
    function getVaultInfo(address _owner)
        external
        view
        returns (
            address owner,
            address backup,
            uint256 balance,
            uint256 lastPingTime,
            uint256 pingInterval,
            bool    claimed,
            bool    active,
            uint256 deadline,
            uint256 timeRemaining,
            bool    isExpired
        )
    {
        Vault memory v = vaults[_owner];
        uint256 dl      = v.lastPingTime + v.pingInterval;
        bool    expired = block.timestamp > dl;
        uint256 rem     = expired ? 0 : dl - block.timestamp;

        return (
            v.owner,
            v.backup,
            v.balance,
            v.lastPingTime,
            v.pingInterval,
            v.claimed,
            v.active,
            dl,
            rem,
            expired
        );
    }

    /**
     * @notice Convenience: returns only whether a given owner's vault is claimable.
     */
    function isClaimable(address _owner) external view returns (bool) {
        Vault memory v = vaults[_owner];
        return v.active && !v.claimed && (block.timestamp > v.lastPingTime + v.pingInterval);
    }
}
