import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Read the contract address written by deploy.js so we can inject it into the
// browser bundle without a dynamic import() or fetch().
function loadDeployedAddress() {
  const infoPath = path.resolve(__dirname, "src/deploymentInfo.json");
  try {
    const raw = fs.readFileSync(infoPath, "utf8");
    return JSON.parse(raw).contractAddress ?? "";
  } catch (_) {
    return "";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    // Makes window.__DEPLOYED_ADDRESS__ available in the browser without any
    // async import.  Re-run `npm run dev` after deploying to pick up a new
    // address.
    "window.__DEPLOYED_ADDRESS__": JSON.stringify(loadDeployedAddress()),
  },
  server: {
    port: 3000,
    open: true,
  },
});
