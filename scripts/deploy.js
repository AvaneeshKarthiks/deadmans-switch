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

  // Write deployment address file consumed by the frontend
  fs.writeFileSync(
    path.join(outDir, "deploymentInfo.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n📄 Deployment info saved → frontend/src/deploymentInfo.json`);

  // Copy the ABI so the frontend can import it directly
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
