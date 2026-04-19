import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useVault } from "./useVault.js";

// ── small reusable pieces ─────────────────────────────────────────────────────

function shorten(addr) {
  if (!addr || addr === ethers.ZeroAddress) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function Alert({ type, children, onClose }) {
  return (
    <div
      className={`alert alert-${type}`}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
    >
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "inherit",
            cursor: "pointer", marginLeft: 12, fontSize: "1.1rem", lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="spinner" />;
}

// ── TimerSection ──────────────────────────────────────────────────────────────

function TimerSection({ vaultInfo, countdown, countdownStr, pct }) {
  if (!vaultInfo) return null;
  const ratio  = vaultInfo.pingInterval > 0 ? countdown / vaultInfo.pingInterval : 0;
  const cls    = vaultInfo.isExpired ? "expired" : ratio < 0.2 ? "warning" : "safe";
  const barCol = vaultInfo.isExpired
    ? "var(--danger)" : ratio < 0.2 ? "var(--warn)" : "var(--success)";
  const [d, h, m, s] = countdownStr.split(":");
  return (
    <>
      <div className="timer-block">
        <div className="timer-label">Time remaining until switch triggers</div>
        <div className={`timer-digits ${cls}`}>
          <span>{d}</span><span style={{ opacity: 0.4 }}>d </span>
          <span>{h}</span><span style={{ opacity: 0.4 }}>h </span>
          <span>{m}</span><span style={{ opacity: 0.4 }}>m </span>
          <span>{s}</span><span style={{ opacity: 0.4 }}>s</span>
        </div>
        {vaultInfo.isExpired && (
          <div style={{ marginTop: 10, color: "var(--danger)", fontFamily: "var(--mono)", fontSize: "0.75rem", letterSpacing: "0.1em" }}>
            ⚠ SWITCH TRIGGERED — backup may now claim
          </div>
        )}
      </div>
      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barCol }} />
      </div>
    </>
  );
}

// ── CreateVaultForm ───────────────────────────────────────────────────────────

function CreateVaultForm({ onCreateVault, txPending }) {
  const [backup, setBackup] = useState("");
  const [days,   setDays]   = useState("7");
  const [eth,    setEth]    = useState("0.01");

  const valid =
    backup.startsWith("0x") && backup.length === 42 &&
    Number(days) >= 1 && Number(days) <= 365 &&
    Number(eth) > 0;

  return (
    <div className="card">
      <div className="card-title">Create New Vault</div>
      <div className="grid-2">
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label className="form-label">Backup Address</label>
          <input
            className="form-input"
            placeholder="0x…"
            value={backup}
            onChange={(e) => setBackup(e.target.value.trim())}
          />
          <div className="form-hint">If you stop pinging, this address can claim the deposited ETH.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Ping Interval (days)</label>
          <input
            className="form-input"
            type="number" min="1" max="365"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <div className="form-hint">1–365 days.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Deposit Amount (ETH)</label>
          <input
            className="form-input"
            type="number" step="0.001" min="0.001"
            value={eth}
            onChange={(e) => setEth(e.target.value)}
          />
          <div className="form-hint">Locked until withdrawn or claimed.</div>
        </div>
      </div>
      <button
        className="btn btn-primary"
        onClick={() => onCreateVault(backup, parseInt(days, 10), parseFloat(eth))}
        disabled={txPending || !valid}
      >
        {txPending ? <><Spinner /> Creating vault…</> : "🔐  Create Vault"}
      </button>
    </div>
  );
}

// ── VaultDashboard ────────────────────────────────────────────────────────────

function VaultDashboard({ vaultInfo, txPending, onPing, onWithdraw }) {
  return (
    <div className="card">
      <div className="card-title">My Vault</div>
      <div className="stats-grid">
        <div className="stat-chip">
          <div className="stat-label">Deposited</div>
          <div className="stat-value accent">{Number(vaultInfo.balance).toFixed(4)} ETH</div>
        </div>
        <div className="stat-chip">
          <div className="stat-label">Backup Address</div>
          <div className="stat-value" title={vaultInfo.backup}>{shorten(vaultInfo.backup)}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-label">Ping Interval</div>
          <div className="stat-value">{Math.floor(vaultInfo.pingInterval / 86400)} days</div>
        </div>
        <div className="stat-chip">
          <div className="stat-label">Status</div>
          <div className={`stat-value ${vaultInfo.claimed ? "warn" : vaultInfo.isExpired ? "danger" : "success"}`}>
            {vaultInfo.claimed ? "CLAIMED" : vaultInfo.isExpired ? "EXPIRED" : "ACTIVE"}
          </div>
        </div>
      </div>
      <div className="action-row">
        <button
          className="btn btn-primary"
          onClick={onPing}
          disabled={txPending || vaultInfo.claimed}
        >
          {txPending ? <><Spinner /> Confirming…</> : "🫀  Send Ping"}
        </button>
        <button
          className="btn btn-danger"
          onClick={onWithdraw}
          disabled={txPending || vaultInfo.claimed}
        >
          {txPending ? <Spinner /> : "↩  Withdraw Funds"}
        </button>
      </div>
      {vaultInfo.isExpired && !vaultInfo.claimed && (
        <div className="alert alert-danger" style={{ marginTop: 16 }}>
          Deadline passed — your backup can now claim this vault.
        </div>
      )}
      {vaultInfo.claimed && (
        <div className="alert alert-warn" style={{ marginTop: 16 }}>
          This vault has been claimed by the backup address.
        </div>
      )}
    </div>
  );
}

// ── BackupPanel ───────────────────────────────────────────────────────────────

function BackupPanel({ onClaim, txPending, account, contractAddress }) {
  const [ownerAddr, setOwnerAddr] = useState("");
  const [info,      setInfo]      = useState(null);
  const [checking,  setChecking]  = useState(false);
  const [lookupErr, setLookupErr] = useState("");

  const checkVault = async () => {
    if (!ownerAddr) return;
    setChecking(true);
    setInfo(null);
    setLookupErr("");
    try {
      if (!contractAddress) {
        setLookupErr("Set the contract address in the Settings tab first.");
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const abi = [
        "function getVaultInfo(address) external view returns (address,address,uint256,uint256,uint256,bool,bool,uint256,uint256,bool)",
      ];
      const c   = new ethers.Contract(contractAddress, abi, signer);
      const raw = await c.getVaultInfo(ownerAddr);
      setInfo({
        backup:        raw[1],
        balance:       Number(raw[2]) / 1e18,
        pingInterval:  Number(raw[4]),
        claimed:       raw[5],
        active:        raw[6],
        timeRemaining: Number(raw[8]),
        isExpired:     raw[9],
      });
    } catch (e) {
      setLookupErr("No vault found at that address, or address is invalid.");
    } finally {
      setChecking(false);
    }
  };

  const isMyBackup = info && info.backup?.toLowerCase() === account?.toLowerCase();
  const canClaim   = isMyBackup && info.isExpired && !info.claimed && info.active;

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Owner Vault Address</label>
        <div className="row">
          <input
            className="form-input"
            placeholder="0x… vault owner's wallet address"
            value={ownerAddr}
            onChange={(e) => setOwnerAddr(e.target.value.trim())}
          />
          <button
            className="btn btn-outline"
            onClick={checkVault}
            disabled={checking || !ownerAddr}
            style={{ flexShrink: 0 }}
          >
            {checking ? <Spinner /> : "Lookup"}
          </button>
        </div>
        <div className="form-hint">Enter the vault owner's wallet to check its status.</div>
      </div>

      {lookupErr && <Alert type="danger">{lookupErr}</Alert>}

      {info && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="stats-grid">
            <div className="stat-chip">
              <div className="stat-label">Balance</div>
              <div className="stat-value accent">{info.balance.toFixed(4)} ETH</div>
            </div>
            <div className="stat-chip">
              <div className="stat-label">Interval</div>
              <div className="stat-value">{Math.floor(info.pingInterval / 86400)}d</div>
            </div>
            <div className="stat-chip">
              <div className="stat-label">Expired?</div>
              <div className={`stat-value ${info.isExpired ? "danger" : "success"}`}>
                {info.isExpired ? "YES" : "NO"}
              </div>
            </div>
            <div className="stat-chip">
              <div className="stat-label">Your Role</div>
              <div className={`stat-value ${isMyBackup ? "success" : "warn"}`}>
                {isMyBackup ? "BACKUP ✓" : "NOT BACKUP"}
              </div>
            </div>
          </div>
          {canClaim && (
            <button className="btn btn-success" onClick={() => onClaim(ownerAddr)} disabled={txPending}>
              {txPending ? <><Spinner /> Claiming…</> : "⚡  Claim Vault Funds"}
            </button>
          )}
          {isMyBackup && !info.isExpired && (
            <div className="alert alert-info">
              Owner is still active. Claimable in {Math.floor(info.timeRemaining / 86400)}d {Math.floor((info.timeRemaining % 86400) / 3600)}h.
            </div>
          )}
          {isMyBackup && info.claimed && (
            <div className="alert alert-warn">This vault has already been claimed.</div>
          )}
          {!isMyBackup && (
            <div className="alert alert-warn">
              Your wallet ({shorten(account)}) is not the backup for this vault.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

function SettingsPanel({ contractAddress, setContractAddress, account, chainId }) {
  const [val, setVal] = useState(contractAddress);
  const isHardhat = chainId === 31337;
  return (
    <div className="card">
      <div className="card-title">Settings</div>
      <div className="form-group">
        <label className="form-label">Contract Address</label>
        <div className="row">
          <input
            className="form-input"
            value={val}
            onChange={(e) => setVal(e.target.value.trim())}
            placeholder="0x…"
          />
          <button className="btn btn-outline" onClick={() => setContractAddress(val)} style={{ flexShrink: 0 }}>
            Save
          </button>
        </div>
        <div className="form-hint">
          Run <code style={{ color: "var(--accent)" }}>npm run deploy:local</code> in the root folder — the address is printed to the terminal and auto-saved to <code style={{ color: "var(--accent)" }}>frontend/src/deploymentInfo.json</code>.
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Connected Account</label>
        <input className="form-input" value={account ?? "—"} readOnly />
      </div>
      <div className="form-group">
        <label className="form-label">Network Chain ID</label>
        <input
          className="form-input"
          value={chainId ? `${chainId}${isHardhat ? " — Hardhat Localhost ✓" : " — ⚠ not Hardhat"}` : "—"}
          readOnly
          style={{ color: chainId ? (isHardhat ? "var(--success)" : "var(--warn)") : undefined }}
        />
      </div>
      <div className="alert alert-info" style={{ marginTop: 8 }}>
        <strong>Time-travel for testing:</strong> advance the chain 8 days to test the claim flow without waiting.<br />
        <code style={{ display: "block", marginTop: 6 }}>
          npx hardhat run scripts/timeTravel.js --network localhost
        </code>
      </div>
    </div>
  );
}

// ── ConnectScreen ─────────────────────────────────────────────────────────────

function ConnectScreen({ onConnect, loading, error, clearMessages }) {
  const hasMetaMask = typeof window !== "undefined" && Boolean(window.ethereum);
  return (
    <div className="connect-section">
      <div className="connect-title">
        Your assets.<br /><span>Your dead man's switch.</span>
      </div>
      <div className="connect-subtitle">
        // deposit ETH · set a backup · stay alive · ping to reset
      </div>

      {/* errors visible BEFORE wallet is connected */}
      {error && (
        <div
          className="alert alert-danger"
          style={{ maxWidth: 460, margin: "0 auto 24px", textAlign: "left" }}
        >
          {error}
          <button
            onClick={clearMessages}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", marginLeft: 12, fontSize: "1rem" }}
          >×</button>
        </div>
      )}

      {!hasMetaMask && (
        <div
          className="alert alert-warn"
          style={{ maxWidth: 460, margin: "0 auto 24px", textAlign: "left" }}
        >
          MetaMask extension not detected.{" "}
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            Install MetaMask
          </a>{" "}
          then refresh this page.
        </div>
      )}

      <button
        className="btn btn-primary btn-lg"
        onClick={onConnect}
        disabled={loading || !hasMetaMask}
      >
        {loading ? <><Spinner /> Connecting…</> : "Connect MetaMask →"}
      </button>

      <div style={{ marginTop: 32, color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "0.75rem", lineHeight: 1.9 }}>
        Add this network in MetaMask if you haven't already:<br />
        <strong style={{ color: "var(--accent)" }}>Network name:</strong> Hardhat Localhost<br />
        <strong style={{ color: "var(--accent)" }}>RPC URL:</strong>{" "}
        <code style={{ color: "var(--text)" }}>http://127.0.0.1:8545</code><br />
        <strong style={{ color: "var(--accent)" }}>Chain ID:</strong> 31337<br />
        <strong style={{ color: "var(--accent)" }}>Currency:</strong> ETH
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [contractAddress, setContractAddress] = useState(() => {
    // Vite replaces window.__DEPLOYED_ADDRESS__ at build/dev start via
    // the define plugin in vite.config.js (written by deploy.js).
    try { return window.__DEPLOYED_ADDRESS__ ?? ""; } catch (_) { return ""; }
  });

  const [tab, setTab] = useState("owner");

  const {
    account, chainId, vaultInfo,
    loading, txPending, error, successMsg,
    countdown, countdownStr, pct,
    connectWallet, createVault, ping, withdraw, claim,
    clearMessages,
  } = useVault(contractAddress);

  const isHardhat = chainId === 31337;

  return (
    <div className="app">
      {/* ── header ── */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">💀</div>
          <div>
            <div className="logo-text">Dead Man's Switch</div>
            <div className="logo-sub">Decentralised Time-Capsule Vault</div>
          </div>
        </div>
        {account ? (
          <div className="wallet-badge">
            <div className="wallet-dot" />
            <span>{shorten(account)}</span>
            <span style={{ color: isHardhat ? "var(--success)" : "var(--warn)" }}>
              {isHardhat ? "Hardhat" : `Chain ${chainId}`}
            </span>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={connectWallet}
            disabled={loading}
          >
            {loading ? <Spinner /> : "Connect Wallet"}
          </button>
        )}
      </header>

      <main className="main">

        {/* ── NOT connected: show full connect screen ── */}
        {!account && (
          <ConnectScreen
            onConnect={connectWallet}
            loading={loading}
            error={error}
            clearMessages={clearMessages}
          />
        )}

        {/* ── CONNECTED ── */}
        {account && (
          <>
            {!isHardhat && (
              <Alert type="warn">
                ⚠ Switch MetaMask to the Hardhat Localhost network — Chain ID 31337, RPC http://127.0.0.1:8545
              </Alert>
            )}

            {error      && <Alert type="danger"  onClose={clearMessages}>{error}</Alert>}
            {successMsg && <Alert type="success" onClose={clearMessages}>{successMsg}</Alert>}

            {/* ── no contract address yet ── */}
            {!contractAddress && (
              <div className="card">
                <div className="card-title">Contract Not Configured</div>
                <div className="form-group">
                  <label className="form-label">Deployed Contract Address</label>
                  <input
                    className="form-input"
                    placeholder="0x…"
                    onBlur={(e) => setContractAddress(e.target.value.trim())}
                    defaultValue=""
                  />
                  <div className="form-hint">
                    Run <code style={{ color: "var(--accent)" }}>npm run deploy:local</code> in the root folder, then paste the printed address here (or in the Settings tab).
                  </div>
                </div>
              </div>
            )}

            {/* ── contract address is set ── */}
            {contractAddress && (
              <>
                {vaultInfo && (
                  <TimerSection
                    vaultInfo={vaultInfo}
                    countdown={countdown}
                    countdownStr={countdownStr}
                    pct={pct}
                  />
                )}

                {/* tabs */}
                <div className="tabs">
                  {[["owner", "Owner"], ["backup", "Backup / Claim"], ["settings", "Settings"]].map(([key, label]) => (
                    <button
                      key={key}
                      className={`tab ${tab === key ? "active" : ""}`}
                      onClick={() => setTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Owner tab */}
                {tab === "owner" && (
                  <>
                    {vaultInfo ? (
                      <VaultDashboard
                        vaultInfo={vaultInfo}
                        txPending={txPending}
                        onPing={ping}
                        onWithdraw={withdraw}
                      />
                    ) : (
                      <>
                        <div className="card">
                          <div className="empty-state">
                            <div className="empty-icon">🔒</div>
                            <div>
                              No active vault for{" "}
                              <span style={{ color: "var(--accent)" }}>{shorten(account)}</span>.
                            </div>
                            <div style={{ opacity: 0.6, marginTop: 6 }}>Create one below.</div>
                          </div>
                        </div>
                        <CreateVaultForm onCreateVault={createVault} txPending={txPending} />
                      </>
                    )}
                  </>
                )}

                {/* Backup tab */}
                {tab === "backup" && (
                  <div className="card">
                    <div className="card-title">Claim a Vault</div>
                    <BackupPanel
                      onClaim={claim}
                      txPending={txPending}
                      account={account}
                      contractAddress={contractAddress}
                    />
                  </div>
                )}

                {/* Settings tab */}
                {tab === "settings" && (
                  <SettingsPanel
                    contractAddress={contractAddress}
                    setContractAddress={setContractAddress}
                    account={account}
                    chainId={chainId}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
