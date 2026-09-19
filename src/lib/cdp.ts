/**
 * Minimal Chrome DevTools Protocol client backed by native WebSocket.
 */

type CDPResponse = {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

export type BrowserTarget = {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
};

export class CDPClient {
  private ws: WebSocket | null = null;
  private id = 0;
  private pending = new Map<number, { resolve: (v: CDPResponse) => void; reject: (e: Error) => void }>();
  private eventHandlers = new Map<string, Array<(params: Record<string, unknown>) => void>>();

  constructor(public readonly endpoint: string) {}

  async connect(retries = 3): Promise<void> {
    if (this.ws?.readyState === 1) return; // 1 = OPEN
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(this.endpoint);
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error("WebSocket connect timeout"));
          }, 5000);
          ws.addEventListener("open", () => {
            clearTimeout(timeout);
            this.ws = ws;
            resolve();
          });
          ws.addEventListener("error", (ev) => {
            clearTimeout(timeout);
            reject(new Error(String(ev.message || "WebSocket error")));
          });
          ws.addEventListener("message", (ev) => {
            const msg = JSON.parse(String(ev.data));
            if (msg.id !== undefined && this.pending.has(msg.id)) {
              const p = this.pending.get(msg.id)!;
              this.pending.delete(msg.id);
              p.resolve(msg);
            }
            if (msg.method && this.eventHandlers.has(msg.method)) {
              for (const handler of this.eventHandlers.get(msg.method)!) {
                handler(msg.params ?? {});
              }
            }
          });
          ws.addEventListener("close", () => {
            this.ws = null;
          });
        });
        return;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    throw lastErr ?? new Error("Failed to connect after retries");
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error("CDP not connected");
    }
    const id = ++this.id;
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timeout);
          if (msg.error) reject(new Error(`CDP error: ${msg.error.message}`));
          else resolve(msg.result ?? {});
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: (params: Record<string, unknown>) => void): void {
    if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
    this.eventHandlers.get(event)!.push(handler);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}

export async function listTargets(browserUrl: string): Promise<BrowserTarget[]> {
  const url = browserUrl.replace(/\/$/, "");
  const res = await fetch(`${url}/json/list`);
  if (!res.ok) throw new Error(`Failed to list targets: ${res.status}`);
  const targets = (await res.json()) as BrowserTarget[];

  const parsed = new URL(url);
  const isProxy = !["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
  if (isProxy) {
    const wsScheme = parsed.protocol === "https:" ? "wss:" : "ws:";
    for (const target of targets) {
      if (target.webSocketDebuggerUrl) {
        const wsPath = new URL(target.webSocketDebuggerUrl).pathname;
        target.webSocketDebuggerUrl = `${wsScheme}//${parsed.host}${wsPath}`;
      }
    }
  }

  return targets;
}

export async function connectTarget(wsUrl: string): Promise<CDPClient> {
  const client = new CDPClient(wsUrl);
  await client.connect(3);
  return client;
}

export async function connectTargetById(browserUrl: string, targetId: string): Promise<CDPClient> {
  const parsed = new URL(browserUrl);
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${parsed.host}/devtools/page/${targetId}`;
  const client = new CDPClient(wsUrl);
  await client.connect(3);
  return client;
}

export async function connectFirstPage(
  browserUrl: string
): Promise<{ client: CDPClient; target: { id: string; title: string; url: string } }> {
  const targets = await listTargets(browserUrl);
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("No page target found");
  const client = await connectTarget(page.webSocketDebuggerUrl);
  return { client, target: { id: page.id, title: page.title, url: page.url } };
}
