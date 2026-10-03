import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isWin = process.platform === "win32";
const PY = isWin && existsSync("C:\\Python313\\python.exe") ? "C:\\Python313\\python.exe" : "python3";

const jobs = [
  { name: "target", cwd: "apps/target", cmd: PY, args: ["app.py"], shell: false },
  { name: "metadata", cwd: "apps/target", cmd: PY, args: ["metadata.py"], shell: false },
  { name: "server", cwd: "apps/server", cmd: PY, args: ["app.py"], shell: false },
  // npm.cmd is a batch file: Windows requires a shell to launch it.
  { name: "web", cwd: "apps/web", cmd: isWin ? "npm.cmd" : "npm", args: ["run", "dev"], shell: isWin },
];

const procs = [];
for (const j of jobs) {
  const cwd = fileURLToPath(new URL(`../${j.cwd}`, import.meta.url));
  const p = spawn(j.cmd, j.args, { cwd, stdio: "inherit", shell: j.shell });
  procs.push(p);
  p.on("exit", (code) => console.log(`[${j.name}] exited ${code}`));
}
process.on("SIGINT", () => { for (const p of procs) p.kill("SIGINT"); process.exit(0); });
