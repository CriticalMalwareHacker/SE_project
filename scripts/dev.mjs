import { spawn } from "node:child_process";

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const PY = process.platform === "win32" && existsSync("C:\\Python313\\python.exe") ? "C:\\Python313\\python.exe" : "python3";

const jobs = [
  { name: "target", cwd: "apps/target", cmd: PY, args: ["app.py"] },
  { name: "metadata", cwd: "apps/target", cmd: PY, args: ["metadata.py"] },
  { name: "server", cwd: "apps/server", cmd: PY, args: ["app.py"] },
  { name: "web", cwd: "apps/web", cmd: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", "dev"] },
];

const procs = [];
for (const j of jobs) {
  const p = spawn(j.cmd, j.args, { cwd: new URL(`../../${j.cwd}`, import.meta.url), stdio: "inherit", shell: false });
  procs.push(p);
  p.on("exit", (code) => console.log(`[${j.name}] exited ${code}`));
}
process.on("SIGINT", () => { for (const p of procs) p.kill("SIGINT"); process.exit(0); });
