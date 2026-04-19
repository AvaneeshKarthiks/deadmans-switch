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

function friendlyError(e) {
  const msg = e?.reason ?? e?.shortMessage ?? e?.message ?? "Unknown error";
  return msg
    .replace(/.*execution reverted:\s*/i, "")
    .replace(/.*reverted with reason string\s*/i, "")
    .slice(0, 200);
}

export function useVault(contractAddress) {
  const [signer,     setSigner]     = useState(null);
  const [contract,   setContract]   = useState(null);
  const [account,    setAccount]    = useState(null);
  const [chainId,    setChainId]    = useState(null);
  const [vaultInfo,  setVaultInfo]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [txPending,  setTxPending]  = useState(false);
  const [error,      setError]      = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [countdown,  setCountdown]  = useState(0);
  const tickRef = useRef(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMsg(null);
  }, []);

  // ── rebuild contract when address or signer changes ────────────────────────
  useEffect(() => {
    if (!contractAddress || !signer) { setContract(null); return; }
    try {
      setContract(new ethers.Contract(contractAddress, VAULT_ABI, signer));
    } catch (_) {
      setContract(null);
    }
  }, [contractAddress, signer]);

  // ── connect wallet ─────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    clearMessages();

    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask not found. Install the MetaMask browser extension and refresh.");
      return;
    }

    setLoading(true);
    try {
      // Prompt the user to select an account
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const s        = await provider.getSigner();
      const addr     = await s.getAddress();
      const network  = await provider.getNetwork();

      setSigner(s);
      setAccount(addr);
      setChainId(Number(network.chainId));
    } catch (e) {
      if (e?.code === 4001) {
        setError("Connection rejected. Click Connect and approve the MetaMask prompt.");
      } else {
        setError(friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  }, [clearMessages]);

  // ── fetch vault info ───────────────────────────────────────────────────────
  const fetchVaultInfo = useCallback(async (ownerAddr) => {
    if (!contract || !ownerAddr) return;
    try {
      const raw  = await contract.getVaultInfo(ownerAddr);
      const info = parseVaultInfo(raw);
      if (info.active) {
        setVaultInfo(info);
        setCountdown(info.timeRemaining);
      } else {
        setVaultInfo(null);
        setCountdown(0);
      }
    } catch (_) {
      setVaultInfo(null);
      setCountdown(0);
    }
  }, [contract]);

  // ── auto-fetch when account or contract changes ────────────────────────────
  useEffect(() => {
    if (account && contract) fetchVaultInfo(account);
  }, [account, contract, fetchVaultInfo]);

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
    const reload = () => window.location.reload();
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged",    reload);
    return () => {
      window.ethereum.removeListener("accountsChanged", reload);
      window.ethereum.removeListener("chainChanged",    reload);
    };
  }, []);

  // ── generic transaction executor ───────────────────────────────────────────
  const execTx = useCallback(async (buildTx, successText) => {
    clearMessages();
    setTxPending(true);
    try {
      const tx = await buildTx();
      await tx.wait();
      setSuccessMsg(successText);
      await new Promise((r) => setTimeout(r, 400));
      await fetchVaultInfo(account);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setTxPending(false);
    }
  }, [account, clearMessages, fetchVaultInfo]);

  // ── public actions ─────────────────────────────────────────────────────────
  const createVault = useCallback((backupAddr, pingDays, ethAmount) =>
    execTx(
      () => contract.createVault(backupAddr, pingDays, {
        value: ethers.parseEther(String(ethAmount)),
      }),
      "Vault created! Countdown started."
    ), [contract, execTx]);

  const ping = useCallback(() =>
    execTx(() => contract.ping(), "Ping sent — countdown reset. ✓"),
    [contract, execTx]);

  const withdraw = useCallback(() =>
    execTx(() => contract.withdraw(), "Funds withdrawn to your wallet."),
    [contract, execTx]);

  const claim = useCallback((ownerAddr) =>
    execTx(() => contract.claim(ownerAddr), "Vault claimed! Funds transferred."),
    [contract, execTx]);

  // ── derived ────────────────────────────────────────────────────────────────
  const countdownStr = formatCountdown(countdown);
  const pct = (vaultInfo?.pingInterval > 0)
    ? (countdown / vaultInfo.pingInterval) * 100
    : 0;

  return {
    account, chainId, vaultInfo,
    loading, txPending, error, successMsg,
    countdown, countdownStr, pct,
    connectWallet, createVault, ping, withdraw, claim,
    fetchVaultInfo, clearMessages,
  };
}
