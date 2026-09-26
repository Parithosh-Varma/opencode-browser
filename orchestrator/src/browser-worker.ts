import { CDP, findTarget } from "./cdp.ts";
import type { WorkerConfig } from "./types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsString(value: string) {
  return JSON.stringify(value);
}

export async function runBrowserWorker(config: Extract<WorkerConfig, {type:"browser"}>, prompt: string): Promise<string> {
  const target = await findTarget(config.browserUrl, config.targetId);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();

  try {
    const before = await readAssistantText(cdp, config.assistantSelector ?? "main");
    await fillInput(cdp, config.inputSelector, prompt);

    if (config.sendSelector) {
      const clicked = await cdp.call("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${jsString(config.sendSelector!)});
          if (!el) return false;
          el.click();
          return true;
        })()`,
        returnByValue: true
      });
      if (!clicked?.result?.value) await pressEnter(cdp, config.inputSelector);
    } else {
      await pressEnter(cdp, config.inputSelector);
    }

    const deadline = Date.now() + (config.timeoutMs ?? 180000);
    let stable = 0;
    let last = before;

    while (Date.now() < deadline) {
      await sleep(1000);
      const current = await readAssistantText(cdp, config.assistantSelector ?? "main");
      if (current && current !== before) {
        if (current === last) stable++;
        else stable = 0;
        last = current;
        if (stable >= 3) return current;
      }
    }

    throw new Error("Browser worker timed out waiting for a stable assistant response");
  } finally {
    cdp.close();
  }
}

async function readAssistantText(cdp: CDP, selector: string) {
  const result = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const nodes = [...document.querySelectorAll(${jsString(selector)})];
      return nodes.map(n => n.innerText || n.textContent || "").join("\\n\\n").trim();
    })()`,
    returnByValue: true
  });
  return String(result?.result?.value ?? "");
}

async function fillInput(cdp: CDP, selector: string, value: string) {
  const result = await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${jsString(selector)});
      if (!el) return false;
      el.focus();
      if ("value" in el) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
          ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(el, ${jsString(value)});
        else (el as HTMLTextAreaElement).value = ${jsString(value)};
      } else {
        el.textContent = ${jsString(value)};
      }
      el.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:${jsString(value)}}));
      el.dispatchEvent(new Event("change", {bubbles:true}));
      return true;
    })()`,
    returnByValue: true
  });
  if (!result?.result?.value) throw new Error(`Input selector not found: ${selector}`);
}

async function pressEnter(cdp: CDP, selector: string) {
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${jsString(selector)});
      if (!el) return false;
      el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", code:"Enter", bubbles:true}));
      el.dispatchEvent(new KeyboardEvent("keyup", {key:"Enter", code:"Enter", bubbles:true}));
      return true;
    })()`,
    returnByValue: true
  });
}
