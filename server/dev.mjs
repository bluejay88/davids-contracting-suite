import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(serverDir, "..");
const nodeExecutable = process.execPath;

const children = [];

const spawnChild = (args) => {
  const child = spawn(nodeExecutable, args, {
    cwd: rootDir,
    stdio: "inherit",
  });

  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
};

const shutdown = (code = 0) => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  });
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

spawnChild(["server/index.mjs", "--dev"]);
spawnChild(["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "4173"]);
