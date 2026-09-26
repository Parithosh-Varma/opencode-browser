import { spawn } from "node:child_process";
import type { WorkerConfig } from "./types.ts";

export async function runTerminalWorker(config: Extract<WorkerConfig, {type:"terminal"}>, prompt: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args ?? [], {
      cwd: config.cwd,
      env: {...process.env, ...(config.env ?? {})},
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Terminal worker timed out after ${config.timeoutMs ?? 180000}ms`));
    }, config.timeoutMs ?? 180000);

    child.stdout.on("data", (d) => stdout += d.toString());
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Terminal worker exited with code ${code}: ${stderr || stdout}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
