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

  const reset = () => { setInfo(null); setLookupErr(""); setOwnerAddr(""); };

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

      // Normalize both addresses to EIP-55 checksum form before passing to ethers v6.
      // MetaMask address displays and Hardhat terminal output are lowercase — ethers v6
      // throws 'bad address checksum' if you pass non-checksummed addresses to a
      // Contract constructor or as call arguments.
      let checksumContract, checksumOwner;
      try {
        checksumContract = ethers.getAddress(contractAddress);
      } catch {
        setLookupErr("The saved contract address is invalid. Update it in the Settings tab.");
        return;
      }
      try {
        checksumOwner = ethers.getAddress(ownerAddr);
      } catch {
        setLookupErr("That doesn't look like a valid Ethereum address. Check for typos.");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const abi = [
        "function getVaultInfo(address _owner) external view returns (address owner, address backup, uint256 balance, uint256 lastPingTime, uint256 pingInterval, bool claimed, bool active, uint256 deadline, uint256 timeRemaining, bool isExpired)",
      ];
      const c   = new ethers.Contract(checksumContract, abi, signer);
      const raw = await c.getVaultInfo(checksumOwner);
      const active = raw[6];

      // An address with no vault returns active=false with lastPingTime=0 and
      // pingInterval=0. That makes block.timestamp > 0+0 always true, which
      // would show isExpired=YES and Balance=0 for every non-existent vault.
      if (!active) {
        setLookupErr(
          "No active vault found for that address. " +
          "Make sure you entered the vault OWNER's address — not your own."
        );
        return;
      }

      setInfo({
        backup:        raw[1],
        balance:       Number(raw[2]) / 1e18,
        pingInterval:  Number(raw[4]),
        claimed:       raw[5],
        active:        true,
        timeRemaining: Number(raw[8]),
        isExpired:     raw[9],
      });
    } catch (e) {
      console.error("BackupPanel checkVault error:", e);
      const msg = e?.reason ?? e?.shortMessage ?? e?.message ?? "";
      if (msg.includes("could not decode result data")) {
        setLookupErr(
          "The contract at the saved address doesn't match. " +
          "Re-run deploy and update the address in Settings."
        );
      } else {
        setLookupErr("Lookup failed: " + msg.slice(0, 120));
      }
    } finally {
      setChecking(false);
    }
  };

  const isMyBackup = info && info.backup?.toLowerCase() === account?.toLowerCase();
  const canClaim   = isMyBackup && info.isExpired && !info.claimed && info.active;

  // ── lookup form ──────────────────────────────────────────────────────────
  if (!info) {
    return (
      <div>

        <div className="form-group">
          <label className="form-label">Vault Owner's Wallet Address</label>
          <div className="row">
            <input
              className="form-input"
              placeholder="0x… the owner's wallet"
              value={ownerAddr}
              onChange={(e) => setOwnerAddr(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && checkVault()}
            />
            <button
              className="btn btn-outline"
              onClick={checkVault}
              disabled={checking || !ownerAddr}
              style={{ flexShrink: 0 }}
            >
              {checking ? <Spinner /> : "Look up"}
            </button>
          </div>
        </div>

        {lookupErr && <Alert type="danger">{lookupErr}</Alert>}
      </div>
    );
  }

  // ── vault result ─────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={reset}
          style={{ fontSize: "0.78rem", padding: "4px 12px" }}
        >
          ← Back
        </button>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "var(--mono)" }}>
          Vault owned by {shorten(ownerAddr)}
        </span>
      </div>

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
            Your connected wallet ({shorten(account)}) is not the backup for this vault —
            you can view it but cannot claim it. Switch to the backup account to claim.
          </div>
        )}
      </div>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

function SettingsPanel({ contractAddress, setContractAddress, account, chainId }) {
  // Keep local draft in sync with the prop so the field always reflects the
  // current address even if it was changed from outside (deploy script, etc.).
  const [val, setVal] = useState(contractAddress);
  useEffect(() => { setVal(contractAddress); }, [contractAddress]);

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
    // Priority order for the initial contract address:
    //   1. localStorage — set by the user manually via Settings (survives reloads)
    //   2. window.__DEPLOYED_ADDRESS__ — injected by Vite from deploymentInfo.json
    //      at dev-server startup. Goes stale after Hardhat restart + redeploy
    //      until `npm run dev` is also restarted.
    //   3. Empty string — shows the "Contract Not Configured" prompt.
    //
    // localStorage wins so that a manually-entered correct address is not
    // silently overwritten by a stale injected value on the next page load.
    try {
      const fromStorage  = localStorage.getItem("dms_contract_address") ?? "";
      const fromVite     = window.__DEPLOYED_ADDRESS__ ?? "";
      const raw          = fromStorage || fromVite;
      return raw ? ethers.getAddress(raw) : "";
    } catch (_) { return ""; }
  });

  /**
   * Normalize the address to EIP-55 checksum form, persist it in localStorage
   * so it survives page reloads, then update React state.
   *
   * ethers v6 throws "bad address checksum" for lowercase addresses, and both
   * MetaMask address displays and Hardhat terminal output are lowercase.
   * Centralizing normalization here means callers never have to think about it.
   */
  const safeSetContractAddress = (raw) => {
    if (!raw || !raw.trim()) {
      localStorage.removeItem("dms_contract_address");
      setContractAddress("");
      return;
    }
    try {
      const checksummed = ethers.getAddress(raw.trim());
      localStorage.setItem("dms_contract_address", checksummed);
      setContractAddress(checksummed);
    } catch {
      // Address is not valid hex yet (user is mid-typing, or copied wrong value).
      // Store as-is so the Settings input stays responsive while typing.
      // useVault's contract creation effect will show a clear error once the
      // user finishes and the invalid address reaches it.
      setContractAddress(raw.trim());
    }
  };

  const [tab, setTab] = useState("owner");

  const {
    account, chainId, vaultInfo,
    loading, txPending, error, successMsg,
    countdown, countdownStr, pct,
    connectWallet, switchAccount, disconnect,
    createVault, ping, withdraw, claim,
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="wallet-badge">
              <div className="wallet-dot" />
              <span>{shorten(account)}</span>
              <span style={{ color: isHardhat ? "var(--success)" : "var(--warn)" }}>
                {isHardhat ? "Hardhat" : `Chain ${chainId}`}
              </span>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={switchAccount}
              title="Switch MetaMask account"
              style={{ fontSize: "0.72rem", padding: "4px 10px" }}
            >
              Switch
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={disconnect}
              title="Disconnect wallet"
              style={{ fontSize: "0.72rem", padding: "4px 10px", color: "var(--danger)" }}
            >
              Disconnect
            </button>
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
                    onBlur={(e) => safeSetContractAddress(e.target.value)}
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
                    setContractAddress={safeSetContractAddress}
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
