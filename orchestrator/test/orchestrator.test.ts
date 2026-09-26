import { expect, test } from "bun:test";
import { runOrchestra } from "../src/orchestrator.ts";
import type { OrchestraConfig } from "../src/types.ts";

test("stops at completion marker", async () => {
  const config: OrchestraConfig = {
    maxTurns: 8,
    maxCharsPerMessage: 5000,
    stabilityPolls: 4,
    stabilityDelayMs: 10,
    pipeline: ["a"],
    workers: { a: { type: "terminal", command: process.execPath, args: ["-e", "process.stdout.write('TASK_COMPLETE')"] } }
  };
  const result = await runOrchestra(config, "test");
  expect(result.final).toBe("TASK_COMPLETE");
  expect(result.state.turn).toBe(1);
});
