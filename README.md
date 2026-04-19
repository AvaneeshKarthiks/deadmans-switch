# 💀 Dead Man's Switch — Decentralised Time-Capsule Vault

A smart-contract vault on a local Hardhat blockchain. The owner deposits ETH
and must "ping" the contract before a deadline. If they miss the window, the
designated backup address can claim the funds.

---

## Project Structure

```
deadmans-switch/
│
├── contracts/
│   └── Vault.sol               ← Solidity smart contract
│
├── scripts/
│   └── deploy.js               ← Hardhat deploy script
│
├── test/
│   └── Vault.test.js           ← Mocha/Chai unit tests
│
├── hardhat.config.js           ← Hardhat configuration
├── package.json                ← Root (Hardhat) dependencies
│
└── frontend/                   ← React + Vite UI
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx             ← Main UI component
        ├── useVault.js         ← Custom hook (ethers.js + contract calls)
        └── index.css           ← Global styles
```

---

## Prerequisites

| Tool        | Version   | Install                                   |
|-------------|-----------|-------------------------------------------|
| Node.js     | ≥ 18.x    | https://nodejs.org                        |
| npm         | ≥ 9.x     | Comes with Node                           |
| MetaMask    | any       | https://metamask.io/download/             |

> **Note:** You do NOT need real ETH. Everything runs locally with fake test ETH.

---

## Step-by-Step Setup

### 1 — Clone / enter the project

```bash
cd deadmans-switch
```

### 2 — Install Hardhat dependencies (root)

```bash
npm install
```

This installs Hardhat, ethers, Chai, and the Hardhat Toolbox into `node_modules/`.

### 3 — Compile the smart contract

```bash
npm run compile
# or: npx hardhat compile
```

Expected output:
```
Compiled 1 Solidity file successfully (evm target: paris).
```

The compiled artefacts land in `artifacts/contracts/Vault.sol/DeadMansVault.json`.

### 4 — Run the unit tests (optional but recommended)

```bash
npm test
# or: npx hardhat test
```

All 14 tests should pass, including time-travel tests that simulate weeks
passing via `@nomicfoundation/hardhat-network-helpers`.

### 5 — Start a local Hardhat blockchain node

Open **Terminal 1** and keep it running:

```bash
npm run node
# or: npx hardhat node
```

Hardhat prints 20 test accounts, each pre-funded with 10 000 ETH.
Copy **Account #0** (owner) and **Account #1** (backup) private keys — you'll
import them into MetaMask.

Example output:
```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### 6 — Deploy the contract

Open **Terminal 2** (leave Terminal 1 running):

```bash
npm run deploy:local
```

Expected output:
```
─────────────────────────────────────────
 Dead Man's Switch – Deployment
─────────────────────────────────────────
Deployer : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Balance  : 10000.0 ETH

✅ DeadMansVault deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

📄 Deployment info saved → frontend/src/deploymentInfo.json
📄 ABI copied           → frontend/src/VaultABI.json

─────────────────────────────────────────
 Next step: cd frontend && npm run dev
─────────────────────────────────────────
```

**Copy the deployed contract address** — the UI auto-loads it from
`frontend/src/deploymentInfo.json`, but you can also paste it manually.

### 7 — Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

The browser opens at **http://localhost:3000**.

---

## MetaMask Configuration

### Add the Hardhat localhost network

1. Open MetaMask → click the network dropdown → **Add a network manually**
2. Fill in:
   | Field            | Value                    |
   |------------------|--------------------------|
   | Network Name     | Hardhat Localhost        |
   | RPC URL          | `http://127.0.0.1:8545`  |
   | Chain ID         | `31337`                  |
   | Currency Symbol  | `ETH`                    |
3. Click **Save**.

### Import test accounts

1. MetaMask → click your avatar → **Import Account**
2. Paste **Account #0's private key** (owner) → Import
3. Repeat for **Account #1** (backup)

> ⚠️  Never use these keys on mainnet — they are publicly known test keys.

---

## Using the DApp

### As the Owner (Account #0)

1. Make sure MetaMask is on **Hardhat Localhost** and Account #0 is selected.
2. Click **Connect MetaMask** in the UI.
3. Go to the **Owner** tab.
4. Since no vault exists yet, fill in the **Create New Vault** form:
   - **Backup Address**: paste Account #1's address
   - **Ping Interval**: e.g. `7` (days)
   - **Deposit Amount**: e.g. `0.01` (ETH)
5. Click **Create Vault** and confirm the MetaMask transaction.
6. The countdown timer starts immediately.
7. Click **Send Ping** any time before the deadline to reset the clock.
8. Click **Withdraw Funds** to reclaim your ETH and close the vault.

### As the Backup (Account #1)

1. Switch MetaMask to Account #1.
2. Go to the **Backup / Claim** tab.
3. Enter Account #0's wallet address and click **Lookup**.
4. If the vault has expired, the **Claim Vault Funds** button appears.
5. Click it and confirm the transaction to receive the ETH.

> **Testing expiry without waiting**: Use Hardhat's time-travel in a test
> script, or reduce the ping interval to `1` day and run
> `npx hardhat console --network localhost` then:
> ```js
> await network.provider.send("evm_increaseTime", [86401])
> await network.provider.send("evm_mine")
> ```

---

## Contract Overview

```
createVault(backup, days)  payable
  └─ Stores vault, starts countdown

ping()
  └─ Resets lastPingTime → extends deadline

withdraw()
  └─ Owner reclaims ETH, closes vault

claim(ownerAddr)
  └─ Backup reclaims ETH after deadline passed

getVaultInfo(owner)        view
  └─ Returns all vault fields + derived countdown

isClaimable(owner)         view
  └─ Returns true if backup can claim right now
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| "No active vault found" on ping | You haven't created a vault yet, or you withdrew it. |
| MetaMask shows wrong chainId | Switch network to Hardhat Localhost (31337). |
| `connect ECONNREFUSED 127.0.0.1:8545` | Start the node first: `npm run node` in Terminal 1. |
| Frontend shows old contract address | Re-run `npm run deploy:local` or update it in Settings tab. |
| Nonce too high error in MetaMask | MetaMask → Settings → Advanced → Clear activity tab data. |

---

## Tech Stack

| Layer    | Tool                              |
|----------|-----------------------------------|
| Contract | Solidity 0.8.20                   |
| Dev env  | Hardhat 2.x + hardhat-toolbox     |
| Testing  | Mocha, Chai, hardhat-network-helpers |
| Frontend | React 18, Vite 5                  |
| Web3     | ethers.js v6                      |
| Wallet   | MetaMask                          |
