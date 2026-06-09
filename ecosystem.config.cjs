// PM2 process definitions for a native (no-Docker) VPS deploy. See DEPLOYMENT-NATIVE.md.
//   pm2 start ecosystem.config.cjs && pm2 save
//
// Both apps run from their package dir via `pnpm start`. The API auto-loads apps/api/.env
// (tsx --env-file-if-exists); the web app's NEXT_PUBLIC_* vars are already baked at build time.
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "yt-api",
      cwd: path.join(__dirname, "apps/api"),
      script: "pnpm",
      args: "start",
      interpreter: "none", // pnpm is itself the launcher; don't wrap with node
      env: { NODE_ENV: "production" },
      max_memory_restart: "900M", // Chromium fallback can spike memory
    },
    {
      name: "yt-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "pnpm",
      args: "start",
      interpreter: "none",
      env: { NODE_ENV: "production", PORT: "3000" },
    },
  ],
};
