const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");

describe("DeadMansVault", function () {

  // ── helpers ──────────────────────────────────────────────────────────────
  const ONE_ETH    = ethers.parseEther("1.0");
  const DAY        = 86_400;           // seconds
  const PING_DAYS  = 7;                // default 7-day window

  async function deploy() {
    const [owner, backup, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DeadMansVault");
    const vault   = await Factory.deploy();
    return { vault, owner, backup, stranger };
  }

  async function deployWithActiveVault() {
    const ctx = await deploy();
    const { vault, owner, backup } = ctx;
    await vault.connect(owner).createVault(backup.address, PING_DAYS, { value: ONE_ETH });
    return ctx;
  }

  // ── createVault ───────────────────────────────────────────────────────────
  describe("createVault()", function () {

    it("creates a vault and stores correct state", async function () {
      const { vault, owner, backup } = await deploy();
      await vault.connect(owner).createVault(backup.address, PING_DAYS, { value: ONE_ETH });

      const info = await vault.getVaultInfo(owner.address);
      expect(info.owner).to.equal(owner.address);
      expect(info.backup).to.equal(backup.address);
      expect(info.balance).to.equal(ONE_ETH);
      expect(info.active).to.be.true;
      expect(info.claimed).to.be.false;
      expect(info.pingInterval).to.equal(BigInt(PING_DAYS * DAY));
    });

    it("emits VaultCreated event", async function () {
      const { vault, owner, backup } = await deploy();
      await expect(
        vault.connect(owner).createVault(backup.address, PING_DAYS, { value: ONE_ETH })
      ).to.emit(vault, "VaultCreated")
        .withArgs(owner.address, backup.address, BigInt(PING_DAYS * DAY), ONE_ETH);
    });

    it("reverts if no ETH deposited", async function () {
      const { vault, owner, backup } = await deploy();
      await expect(
        vault.connect(owner).createVault(backup.address, PING_DAYS, { value: 0 })
      ).to.be.revertedWith("Must deposit ETH");
    });

    it("reverts if backup == owner", async function () {
      const { vault, owner } = await deploy();
      await expect(
        vault.connect(owner).createVault(owner.address, PING_DAYS, { value: ONE_ETH })
      ).to.be.revertedWith("Backup cannot be the owner");
    });

    it("reverts if a vault already exists for caller", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();
      await expect(
        vault.connect(owner).createVault(backup.address, PING_DAYS, { value: ONE_ETH })
      ).to.be.revertedWith("Vault already exists");
    });

    it("reverts on invalid interval (0 or >365)", async function () {
      const { vault, owner, backup } = await deploy();
      await expect(
        vault.connect(owner).createVault(backup.address, 0, { value: ONE_ETH })
      ).to.be.revertedWith("Interval must be 1–365 days");
      await expect(
        vault.connect(owner).createVault(backup.address, 366, { value: ONE_ETH })
      ).to.be.revertedWith("Interval must be 1–365 days");
    });
  });

  // ── ping ──────────────────────────────────────────────────────────────────
  describe("ping()", function () {

    it("resets lastPingTime and emits Pinged", async function () {
      const { vault, owner } = await deployWithActiveVault();

      const before = (await vault.getVaultInfo(owner.address)).lastPingTime;
      await time.increase(DAY * 3);
      await vault.connect(owner).ping();
      const after = (await vault.getVaultInfo(owner.address)).lastPingTime;

      expect(after).to.be.greaterThan(before);
    });

    it("reverts if called by non-owner", async function () {
      const { vault, stranger } = await deployWithActiveVault();
      await expect(vault.connect(stranger).ping()).to.be.revertedWith("No active vault found");
    });
  });

  // ── claim ─────────────────────────────────────────────────────────────────
  describe("claim()", function () {

    it("allows backup to claim after interval expires", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();

      // Advance past the ping deadline
      await time.increase(DAY * PING_DAYS + 1);

      const balBefore = await ethers.provider.getBalance(backup.address);
      const tx        = await vault.connect(backup).claim(owner.address);
      const receipt   = await tx.wait();
      const gasCost   = receipt.gasUsed * tx.gasPrice;
      const balAfter  = await ethers.provider.getBalance(backup.address);

      // backup should have received ~1 ETH (minus gas)
      expect(balAfter - balBefore + gasCost).to.be.closeTo(ONE_ETH, ethers.parseEther("0.001"));
    });

    it("emits Claimed event", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();
      await time.increase(DAY * PING_DAYS + 1);

      await expect(vault.connect(backup).claim(owner.address))
        .to.emit(vault, "Claimed")
        .withArgs(backup.address, owner.address, ONE_ETH);
    });

    it("reverts if owner still within window", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();
      await expect(vault.connect(backup).claim(owner.address))
        .to.be.revertedWith("Owner is still within their ping window");
    });

    it("reverts if called by stranger (not backup)", async function () {
      const { vault, owner, stranger } = await deployWithActiveVault();
      await time.increase(DAY * PING_DAYS + 1);
      await expect(vault.connect(stranger).claim(owner.address))
        .to.be.revertedWith("Caller is not the backup address");
    });

    it("reverts on double-claim", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();
      await time.increase(DAY * PING_DAYS + 1);
      await vault.connect(backup).claim(owner.address);
      await expect(vault.connect(backup).claim(owner.address))
        .to.be.revertedWith("No active vault for this owner");
    });

    it("ping resets clock so backup cannot claim", async function () {
      const { vault, owner, backup } = await deployWithActiveVault();

      await time.increase(DAY * 5);
      await vault.connect(owner).ping();         // owner pings; clock resets
      await time.increase(DAY * 4);              // only 4 more days pass

      await expect(vault.connect(backup).claim(owner.address))
        .to.be.revertedWith("Owner is still within their ping window");
    });
  });

  // ── withdraw ──────────────────────────────────────────────────────────────
  describe("withdraw()", function () {

    it("lets owner reclaim ETH and closes the vault", async function () {
      const { vault, owner } = await deployWithActiveVault();

      const balBefore = await ethers.provider.getBalance(owner.address);
      const tx        = await vault.connect(owner).withdraw();
      const receipt   = await tx.wait();
      const gasCost   = receipt.gasUsed * tx.gasPrice;
      const balAfter  = await ethers.provider.getBalance(owner.address);

      expect(balAfter - balBefore + gasCost).to.be.closeTo(ONE_ETH, ethers.parseEther("0.001"));

      const info = await vault.getVaultInfo(owner.address);
      expect(info.active).to.be.false;
    });

    it("emits Withdrawn event", async function () {
      const { vault, owner } = await deployWithActiveVault();
      await expect(vault.connect(owner).withdraw())
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, ONE_ETH);
    });
  });

  // ── isClaimable ───────────────────────────────────────────────────────────
  describe("isClaimable()", function () {

    it("returns false before expiry", async function () {
      const { vault, owner } = await deployWithActiveVault();
      expect(await vault.isClaimable(owner.address)).to.be.false;
    });

    it("returns true after expiry", async function () {
      const { vault, owner } = await deployWithActiveVault();
      await time.increase(DAY * PING_DAYS + 1);
      expect(await vault.isClaimable(owner.address)).to.be.true;
    });
  });
});
