#!/usr/bin/env bun
import { loadConfig, runOrchestra } from "./src/orchestrator.ts";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const taskIndex = args.indexOf("--task");

const configPath = configIndex >= 0 ? args[configIndex + 1] : "./config.json";
const task = taskIndex >= 0 ? args[taskIndex + 1] : args.filter((x, i) => i !== configIndex && i !== configIndex + 1 && i !== taskIndex && i !== taskIndex + 1).join(" ");

if (!task) {
  console.error("Usage: bun cli.ts --config config.json --task \"your task\"");
  process.exit(1);
}

try {
  const config = await loadConfig(configPath);
  const result = await runOrchestra(config, task);
  console.log("\n===== FINAL OUTPUT =====\n");
  console.log(result.final);
  console.log(`\\n===== ${result.state.turn} TURNS =====`);
} catch (error) {
  console.error("\n[orchestra:error]", error instanceof Error ? error.message : error);
  process.exit(1);
}
