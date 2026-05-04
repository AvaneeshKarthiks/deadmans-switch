const { ethers } = require("hardhat");
const fs          = require("fs");
const path        = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("─────────────────────────────────────────");
  console.log(" Dead Man's Switch – Deployment");
  console.log("─────────────────────────────────────────");
  console.log(`Deployer : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance  : ${ethers.formatEther(balance)} ETH\n`);

  // ── Unique address per deploy ────────────────────────────────────────────
  // Hardhat resets the deployer nonce to 0 on every node restart, which
  // would give the same contract address every time.  Send a random number
  // of cheap self-transfers first so the nonce (and therefore the deployed
  // address) differs on each run.
  const offset = Math.floor(Math.random() * 50) + 1; // 1–50
  console.log(`Nonce offset: +${offset} tx(s) → unique deployment address…`);
  for (let i = 0; i < offset; i++) {
    const tx = await deployer.sendTransaction({ to: deployer.address, value: 0 });
    await tx.wait();
  }
  console.log();

  // ── Deploy ──────────────────────────────────────────────────────────────
  const VaultFactory = await ethers.getContractFactory("DeadMansVault");
  const vault        = await VaultFactory.deploy();
  await vault.waitForDeployment();

  const contractAddress = await vault.getAddress();
  console.log(`✅ DeadMansVault deployed to: ${contractAddress}`);

  // ── Persist deployment info ──────────────────────────────────────────────
  const deploymentInfo = {
    contractAddress,
    deployerAddress: deployer.address,
    network:         (await ethers.provider.getNetwork()).name,
    chainId:         Number((await ethers.provider.getNetwork()).chainId),
    deployedAt:      new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "../frontend/src");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "deploymentInfo.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n📄 Deployment info saved → frontend/src/deploymentInfo.json`);

  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/Vault.sol/DeadMansVault.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(
      path.join(outDir, "VaultABI.json"),
      JSON.stringify(artifact.abi, null, 2)
    );
    console.log(`📄 ABI copied           → frontend/src/VaultABI.json`);
  }

  console.log("\n─────────────────────────────────────────");
  console.log(" Next step: cd frontend && npm run dev");
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
