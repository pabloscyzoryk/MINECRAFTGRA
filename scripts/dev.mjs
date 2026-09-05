import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => {
  if (code) process.exit(code);
  else import("./local-server.mjs");
});
