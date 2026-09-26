import { readFile } from "node:fs/promises";
import type { OrchestraConfig, RunState, Message, WorkerConfig } from "./types.ts";
import { runBrowserWorker } from "./browser-worker.ts";
import { runTerminalWorker } from "./terminal-worker.ts";

export async function loadConfig(path: string): Promise<OrchestraConfig> {
  return JSON.parse(await readFile(path, "utf8")) as OrchestraConfig;
}

export async function runOrchestra(config: OrchestraConfig, task: string) {
  if (!config.pipeline.length) throw new Error("Pipeline is empty");
  for (const name of config.pipeline) {
    if (!config.workers[name]) throw new Error(`Worker "${name}" is missing from config`);
  }

  const state: RunState = { task, turn: 0, history: [] };
  let current = task;

  while (state.turn < config.maxTurns) {
    const workerName = config.pipeline[state.turn % config.pipeline.length];
    const worker = config.workers[workerName];

    // Context compaction keeps the loop bounded before handing the next worker its input.
    current = compactContext(state, current, config.maxCharsPerMessage);

    const startedAt = new Date().toISOString();
    process.stderr.write(`\\n[orchestra] turn ${state.turn + 1}/${config.maxTurns} -> ${workerName}\\n`);

    const output = await runWorker(worker, current);
    const finishedAt = new Date().toISOString();

    const message: Message = {
      turn: state.turn + 1,
      worker: workerName,
      input: current,
      output: output.slice(0, config.maxCharsPerMessage),
      startedAt,
      finishedAt
    };

    state.history.push(message);
    state.turn++;
    current = message.output;

    process.stderr.write(`[orchestra] ${workerName} returned ${message.output.length} chars\\n`);

    if (looksComplete(current)) {
      process.stderr.write("[orchestra] completion marker detected\\n");
      break;
    }
  }

  return { state, final: current };
}

async function runWorker(worker: WorkerConfig, prompt: string) {
  if (worker.type === "browser") return runBrowserWorker(worker, prompt);
  return runTerminalWorker(worker, prompt);
}

function compactContext(state: RunState, current: string, maxChars: number) {
  const recent = state.history.slice(-4).map((m) =>
    `[turn ${m.turn} / ${m.worker}]\\nINPUT:\\n${m.input.slice(0, 2500)}\\nOUTPUT:\\n${m.output.slice(0, 5000)}`
  ).join("\n\n");

  const context = recent ? `Original task: ${state.task}\\n\\nRecent orchestra history:\\n${recent}\\n\\nCurrent handoff:\\n${current}` : current;
  return context.length <= maxChars ? context : context.slice(0, maxChars) + "\n\n[context truncated by orchestrator]";
}

function looksComplete(text: string) {
  return /(?:^|\\n)(?:DONE|TASK_COMPLETE|ORCHESTRA_COMPLETE)(?:$|\\n)/i.test(text.trim());
}
