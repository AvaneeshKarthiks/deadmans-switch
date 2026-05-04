import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";

const VAULT_ABI = [
  "function createVault(address _backup, uint256 _pingIntervalDays) external payable",
  "function ping() external",
  "function claim(address _owner) external",
  "function withdraw() external",
  "function getVaultInfo(address _owner) external view returns (address owner, address backup, uint256 balance, uint256 lastPingTime, uint256 pingInterval, bool claimed, bool active, uint256 deadline, uint256 timeRemaining, bool isExpired)",
  "function isClaimable(address _owner) external view returns (bool)",
];

function formatCountdown(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [d, h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function parseVaultInfo(raw) {
  return {
    owner:         raw[0],
    backup:        raw[1],
    balance:       ethers.formatEther(raw[2]),
    lastPingTime:  Number(raw[3]),
    pingInterval:  Number(raw[4]),
    claimed:       raw[5],
    active:        raw[6],
    deadline:      Number(raw[7]),
    timeRemaining: Number(raw[8]),
    isExpired:     raw[9],
  };
}

/**
 * Normalize any valid hex address to EIP-55 checksum form.
 * ethers v6 throws "bad address checksum" for lowercase addresses passed to
 * Contract constructors or as call arguments. MetaMask displays and Hardhat
 * terminal output are both lowercase, so this must be called on every address
 * that originates outside of ethers itself.
 * Returns null if the input is not a valid address.
 */
function toChecksumAddr(addr) {
  if (!addr || typeof addr !== "string") return null;
  try {
    return ethers.getAddress(addr.trim());
  } catch {
    return null;
  }
}

function friendlyError(e) {
  const raw = e?.reason ?? e?.shortMessage ?? e?.message ?? "Unknown error";

  if (raw.includes("could not decode result data")) {
    return (
      "Contract not found at the saved address. " +
      "Re-run deploy, update the address in Settings, then restart the Vite dev server."
    );
  }
  if (raw.includes("bad address checksum")) {
    return "Invalid address — paste the full 0x… address directly from MetaMask or the terminal.";
  }

  return raw
    .replace(/.*execution reverted:\s*/i, "")
    .replace(/.*reverted with reason string\s*/i, "")
    .slice(0, 200);
}

export function useVault(contractAddress) {
  const [signer,      setSigner]      = useState(null);
  const [contract,    setContract]    = useState(null);
  const [account,     setAccount]     = useState(null);
  const [chainId,     setChainId]     = useState(null);
  const [vaultInfo,   setVaultInfo]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [txPending,   setTxPending]   = useState(false);
  const [error,       setError]       = useState(null);
  const [successMsg,  setSuccessMsg]  = useState(null);
  const [countdown,   setCountdown]   = useState(0);
  // A counter that, when bumped, triggers the auto-fetch effect below.
  // Using a counter instead of calling fetchVaultInfo directly inside execTx
  // avoids stale-closure bugs: execTx captures fetchVaultInfo at creation time,
  // but fetchVaultInfo itself captures `contract` — which may have been recreated
  // between transaction submission and confirmation. The effect always runs with
  // the latest values of account, contract, and fetchVaultInfo.
  const [refreshTick, setRefreshTick] = useState(0);
  const tickRef = useRef(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMsg(null);
  }, []);

  // ── rebuild contract when address or signer changes ────────────────────────
  useEffect(() => {
    if (!contractAddress || !signer) {
      setContract(null);
      return;
    }

    const checksummed = toChecksumAddr(contractAddress);
    if (!checksummed) {
      setContract(null);
      setError("Contract address is not a valid Ethereum address.");
      return;
    }

    try {
      setContract(new ethers.Contract(checksummed, VAULT_ABI, signer));
      // Clear any prior error from a bad address so the new address gets a
      // clean attempt. fetchVaultInfo will set an error if this one also fails.
      setError(null);
    } catch (e) {
      console.error("Contract instantiation failed:", e);
      setContract(null);
      setError(friendlyError(e));
    }
  }, [contractAddress, signer]);

  // ── fetch vault info for the current owner ─────────────────────────────────
  const fetchVaultInfo = useCallback(async (ownerAddr) => {
    if (!contract || !ownerAddr) return;

    const checksummed = toChecksumAddr(ownerAddr);
    if (!checksummed) return; // silently skip — not a valid address

    try {
      const raw  = await contract.getVaultInfo(checksummed);
      const info = parseVaultInfo(raw);
      if (info.active) {
        setVaultInfo(info);
        setCountdown(info.timeRemaining);
      } else {
        setVaultInfo(null);
        setCountdown(0);
      }
    } catch (e) {
      console.error("fetchVaultInfo failed:", e);
      setError(friendlyError(e));
      setVaultInfo(null);
      setCountdown(0);
    }
  }, [contract]);

  // ── auto-fetch on login, account switch, contract change, or after a tx ────
  // refreshTick is bumped by execTx after each confirmed transaction.
  // Depending on refreshTick here (rather than calling fetchVaultInfo directly
  // inside execTx) guarantees this effect always runs with the latest `contract`
  // and `account`, regardless of when execTx's closure was formed.
  useEffect(() => {
    if (account && contract) fetchVaultInfo(account);
  }, [account, contract, fetchVaultInfo, refreshTick]);

  // ── live countdown tick ────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  // ── MetaMask listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        setSigner(null);
        setAccount(null);
        setVaultInfo(null);
        setCountdown(0);
        return;
      }
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const s        = await provider.getSigner();
        const addr     = await s.getAddress(); // always checksummed
        const network  = await provider.getNetwork();
        // Clear stale vault before the new account's fetch completes
        setVaultInfo(null);
        setCountdown(0);
        setError(null);
        setSigner(s);
        setAccount(addr);
        setChainId(Number(network.chainId));
      } catch (e) {
        console.error("accountsChanged handler error:", e);
      }
    };

    const handleChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged",    handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged",    handleChainChanged);
    };
  }, []);

  // ── connect wallet ─────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    clearMessages();
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask not found. Install the MetaMask browser extension and refresh.");
      return;
    }
    setLoading(true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const s        = await provider.getSigner();
      const addr     = await s.getAddress();
      const network  = await provider.getNetwork();
      setSigner(s);
      setAccount(addr);
      setChainId(Number(network.chainId));
    } catch (e) {
      setError(e?.code === 4001
        ? "Connection rejected. Click Connect and approve the MetaMask prompt."
        : friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [clearMessages]);

  // ── open MetaMask account picker ───────────────────────────────────────────
  const switchAccount = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch (_) { /* user dismissed */ }
  }, []);

  // ── disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setVaultInfo(null);
    setCountdown(0);
    clearMessages();
  }, [clearMessages]);

  // ── generic transaction executor ───────────────────────────────────────────
  // After a confirmed transaction we bump refreshTick instead of calling
  // fetchVaultInfo directly. This lets the auto-fetch effect above run with
  // fresh references and avoids stale-closure issues with contract.
  const execTx = useCallback(async (buildTx, successText) => {
    clearMessages();
    setTxPending(true);
    try {
      const tx = await buildTx();
      await tx.wait();
      setSuccessMsg(successText);
      // Small delay so the chain state settles before we query it
      await new Promise((r) => setTimeout(r, 500));
      setRefreshTick((n) => n + 1);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setTxPending(false);
    }
  }, [clearMessages]);
  // Note: execTx no longer depends on fetchVaultInfo or account — it just
  // triggers a tick. The effect that runs on that tick always uses the latest
  // account and contract from React state.

  // ── public actions ─────────────────────────────────────────────────────────
  const createVault = useCallback((backupAddr, pingDays, ethAmount) => {
    const checksummedBackup = toChecksumAddr(backupAddr);
    if (!checksummedBackup) {
      setError("Backup address is not a valid Ethereum address.");
      return;
    }
    return execTx(
      () => contract.createVault(checksummedBackup, pingDays, {
        value: ethers.parseEther(String(ethAmount)),
      }),
      "Vault created! Countdown started."
    );
  }, [contract, execTx]);

  const ping = useCallback(() =>
    execTx(() => contract.ping(), "Ping sent — countdown reset. ✓"),
    [contract, execTx]);

  const withdraw = useCallback(() =>
    execTx(() => contract.withdraw(), "Funds withdrawn to your wallet."),
    [contract, execTx]);

  const claim = useCallback((ownerAddr) => {
    const checksummed = toChecksumAddr(ownerAddr);
    if (!checksummed) {
      setError("Owner address is not a valid Ethereum address.");
      return;
    }
    return execTx(() => contract.claim(checksummed), "Vault claimed! Funds transferred.");
  }, [contract, execTx]);

  // ── derived ────────────────────────────────────────────────────────────────
  const countdownStr = formatCountdown(countdown);
  const pct = (vaultInfo?.pingInterval > 0)
    ? (countdown / vaultInfo.pingInterval) * 100
    : 0;

  return {
    account, chainId, vaultInfo,
    loading, txPending, error, successMsg,
    countdown, countdownStr, pct,
    connectWallet, switchAccount, disconnect,
    createVault, ping, withdraw, claim,
    fetchVaultInfo, clearMessages,
  };
}
