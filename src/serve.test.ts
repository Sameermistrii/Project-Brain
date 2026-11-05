import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initBrain, loadBrain } from "./brain.js";
import { startBoard } from "./serve.js";

test("the board only accepts JSON posts from itself", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-serve-"));
  initBrain(root, "Demo");
  const server = await startBoard(root, 0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (headers: Record<string, string>) =>
    fetch(`${base}/api/goal`, { method: "POST", headers, body: JSON.stringify({ text: "planted" }) });
  try {
    assert.equal((await post({ "content-type": "text/plain" })).status, 415);
    assert.equal((await post({ "content-type": "application/json", origin: "http://evil.example" })).status, 403);
    // fetch drops a custom Host header, so send this one raw.
    const rebound = await new Promise<number>((resolve, reject) =>
      http.get(`${base}/api/state`, { headers: { host: "evil.example" } }, (res) => resolve(res.statusCode ?? 0)).on("error", reject),
    );
    assert.equal(rebound, 403);
    assert.notEqual(loadBrain(root).goal, "planted");
    assert.equal((await post({ "content-type": "application/json", origin: base })).status, 200);
    assert.equal(loadBrain(root).goal, "planted");
  } finally {
    server.close();
  }
});
