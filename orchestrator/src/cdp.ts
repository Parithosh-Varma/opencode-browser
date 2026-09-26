import WebSocket from "ws";

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

export class CDP {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor(private readonly wsUrl: string) {}

  async connect() {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.once("open", () => resolve());
      ws.once("error", reject);
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        const pending = this.pending.get(msg.id);
        if (msg.id && pending) {
          this.pending.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result ?? {});
        }
      });
      ws.on("close", () => (this.ws = null));
    });
  }

  async call(method: string, params: Record<string, unknown> = {}) {
    if (!this.ws) throw new Error("CDP socket is not connected");
    const id = ++this.seq;
    return await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.ws?.close(); this.ws = null; }
}

export async function findTarget(browserUrl: string, targetId?: string) {
  const base = browserUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/json/list`);
  if (!response.ok) throw new Error(`Cannot query CDP: HTTP ${response.status}`);
  const targets = await response.json() as Array<any>;
  const page = targetId
    ? targets.find((t) => t.id === targetId && t.type === "page")
    : targets.find((t) => t.type === "page");
  if (!page) throw new Error("No matching page target found");
  return page;
}
