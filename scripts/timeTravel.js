/**
 * scripts/timeTravel.js
 *
 * Advances the local Hardhat blockchain by 8 days so you can immediately
 * test the backup claim flow without waiting.
 *
 * Usage (while `npx hardhat node` is running in another terminal):
 *   npx hardhat run scripts/timeTravel.js --network localhost
 */

const { ethers, network } = require("hardhat");

async function main() {
  const DAYS    = 8;
  const SECONDS = DAYS * 24 * 60 * 60;

  const beforeBlock = await ethers.provider.getBlock("latest");
  const before      = new Date(beforeBlock.timestamp * 1000);

  console.log("─────────────────────────────────────────");
  console.log(` Time Travel — advancing ${DAYS} days`);
  console.log("─────────────────────────────────────────");
  console.log(`Before : ${before.toUTCString()}`);

  // Increase the block timestamp
  await network.provider.send("evm_increaseTime", [SECONDS]);
  // Mine a new block so the timestamp takes effect
  await network.provider.send("evm_mine");

  const afterBlock = await ethers.provider.getBlock("latest");
  const after      = new Date(afterBlock.timestamp * 1000);

  console.log(`After  : ${after.toUTCString()}`);
  console.log(`\n✅ Chain advanced by ${DAYS} days.`);
  console.log("   Refresh the UI — expired vaults can now be claimed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
