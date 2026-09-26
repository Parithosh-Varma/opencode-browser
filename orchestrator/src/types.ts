export type WorkerConfig =
  | {
      type: "terminal";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    }
  | {
      type: "browser";
      browserUrl: string;
      targetId?: string;
      inputSelector: string;
      sendSelector?: string;
      assistantSelector?: string;
      timeoutMs?: number;
    };

export type OrchestraConfig = {
  maxTurns: number;
  maxCharsPerMessage: number;
  stabilityPolls: number;
  stabilityDelayMs: number;
  workers: Record<string, WorkerConfig>;
  pipeline: string[];
};

export type Message = {
  turn: number;
  worker: string;
  input: string;
  output: string;
  startedAt: string;
  finishedAt: string;
};

export type RunState = {
  task: string;
  turn: number;
  history: Message[];
};
