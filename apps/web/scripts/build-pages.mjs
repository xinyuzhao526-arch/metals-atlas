import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextCli, "build"], {
  // Pages serves public static data only. Do not compile the local FastAPI fallback into the artifact.
  env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_API_URL: "" },
  stdio: "inherit",
});

if (result.status !== 0) process.exit(result.status ?? 1);

// The public Pages artifact must never contain the local administration UI.
rmSync(path.join(process.cwd(), "out", "admin"), { recursive: true, force: true });
console.log("GitHub Pages artifact ready: out/ (admin routes excluded)");
