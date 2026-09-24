import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const privateRoot = path.join(process.cwd(), ".pages-build-private");
const privateAdmin = path.join(privateRoot, "admin");
const privateProxy = path.join(privateRoot, "proxy.ts");
const adminRoot = path.join(process.cwd(), "app", "admin");
const proxyFile = path.join(process.cwd(), "proxy.ts");
if (existsSync(privateRoot)) throw new Error("Refusing to overwrite an existing .pages-build-private directory.");

let result;
try {
  mkdirSync(privateRoot);
  if (existsSync(adminRoot)) renameSync(adminRoot, privateAdmin);
  if (existsSync(proxyFile)) renameSync(proxyFile, privateProxy);
  rmSync(path.join(process.cwd(), "out"), { recursive: true, force: true });
  rmSync(path.join(process.cwd(), ".next"), { recursive: true, force: true });
  result = spawnSync(process.execPath, [nextCli, "build"], {
    // Pages compiles only public routes; local administration and API fallback stay out of the artifact.
    env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_API_URL: "" },
    stdio: "inherit",
  });
} finally {
  if (existsSync(privateAdmin)) renameSync(privateAdmin, adminRoot);
  if (existsSync(privateProxy)) renameSync(privateProxy, proxyFile);
  rmSync(privateRoot, { recursive: true, force: true });
}

if (result?.status !== 0) process.exit(result?.status ?? 1);
console.log("GitHub Pages artifact ready: out/ (admin routes never compiled)");
