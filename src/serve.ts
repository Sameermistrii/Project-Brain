import http from "node:http";
import { addDecision, loadBrain, setGoal, setNow, setWriter } from "./brain.js";
import { runAsk, type AskModel } from "./ask.js";
import { compileBrief, compilePack } from "./brief.js";
import { boardPage } from "./page.js";
import { handoffKindFor, isWriter } from "./policy.js";

export function startBoard(root: string, port: number): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    try {
      await route(root, req, res);
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : "Request failed." });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function route(root: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  // Any web page can reach 127.0.0.1: the Host check stops DNS rebinding, the Origin and JSON checks stop cross-site posts.
  const port = (req.socket.localPort ?? "").toString();
  const self = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!self.includes(req.headers.host ?? "")) {
    send(res, 403, { error: "Wrong host." });
    return;
  }
  const origin = req.headers.origin;
  if (origin && !self.some((host) => origin === `http://${host}`)) {
    send(res, 403, { error: "Wrong origin." });
    return;
  }
  if (req.method === "POST" && !(req.headers["content-type"] ?? "").startsWith("application/json")) {
    send(res, 415, { error: "Expected JSON." });
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(boardPage());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    send(res, 200, state(root));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/pack") {
    send(res, 200, { pack: compilePack(loadBrain(root)) });
    return;
  }
  if (req.method !== "POST") {
    send(res, 404, { error: "Not found." });
    return;
  }
  const body = await readBody(req);
  if (url.pathname === "/api/writer") {
    const writer = body.writer;
    if (writer === null || writer === "" || writer === undefined) {
      setWriter(root, null);
    } else if (isWriter(writer)) {
      setWriter(root, writer);
    } else {
      send(res, 400, { error: "Choose Cursor, Claude, ChatGPT, Grok, yourself, or not chosen." });
      return;
    }
    send(res, 200, state(root));
    return;
  }
  if (url.pathname === "/api/goal") {
    setGoal(root, String(body.text ?? ""));
    send(res, 200, state(root));
    return;
  }
  if (url.pathname === "/api/now") {
    setNow(root, String(body.text ?? ""));
    send(res, 200, state(root));
    return;
  }
  if (url.pathname === "/api/decision") {
    addDecision(root, {
      model: String(body.model ?? "user"),
      decision: String(body.decision ?? ""),
      why: String(body.why ?? ""),
    });
    send(res, 200, state(root));
    return;
  }
  if (url.pathname === "/api/ask") {
    const model = String(body.model ?? "");
    if (model !== "claude" && model !== "gpt" && model !== "grok") {
      send(res, 400, { error: "Pick Claude, ChatGPT, or Grok." });
      return;
    }
    try {
      const result = await runAsk(root, model as AskModel, String(body.task ?? ""));
      send(res, 200, {
        answer: result.answer,
        handoff: result.handoff,
        decision: result.decision,
        kind: handoffKindFor(loadBrain(root).manifest.codeWriter, model),
      });
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : "Ask failed." });
    }
    return;
  }
  send(res, 404, { error: "Not found." });
}

function state(root: string) {
  const snap = loadBrain(root);
  return {
    name: snap.manifest.name,
    codeWriter: snap.manifest.codeWriter,
    goal: snap.goal,
    now: snap.now,
    decisions: snap.decisions.slice(-20).reverse(),
    handoffs: snap.handoffs.slice(-20).reverse(),
    brief: compileBrief(snap, "any"),
    pack: compilePack(snap),
  };
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error("Expected JSON."));
      }
    });
    req.on("error", reject);
  });
}
