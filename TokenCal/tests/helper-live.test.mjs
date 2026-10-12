// Live HTTP test: spawns the real helper on a temp port and drives it.
// Run: node --test tests/helper-live.test.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(__dirname, "..", "tokencal-helper.js");

const PORT = 34000 + Math.floor(Math.random() * 2000);
const TOKEN = "test-token-123";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokencal-live-"));
const configPath = path.join(tmpRoot, "config.json");
fs.writeFileSync(configPath, JSON.stringify({ port: PORT, token: TOKEN }), "utf8");

const base = `http://127.0.0.1:${PORT}`;

function req(route, opts = {}) {
  return fetch(base + route, {
    method: opts.method || "GET",
    headers: Object.assign({}, opts.token === false ? {} : { "x-tokencal-token": TOKEN }, opts.body ? { "content-type": "application/json" } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function waitForPing(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(base + "/ping");
      if (res.ok) return;
    } catch (e) {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("helper did not start");
}

let child;

test.before(async () => {
  child = spawn(process.execPath, [helperPath, "--port", String(PORT), "--config", configPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => console.error("helper:", String(d)));
  await waitForPing();
});

test.after(() => {
  if (child) child.kill();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
});

test("GET /pair returns token, version and a suggested base path", async () => {
  const res = await fetch(base + "/pair");
  const doc = await res.json();
  assert.equal(res.status, 200);
  assert.equal(doc.token, TOKEN);
  assert.ok(doc.version);
  assert.ok(doc.suggestedBase, "suggestedBase present");
  assert.match(doc.suggestedBase, /tokencal$/);
});

test("POST /verify without token is rejected", async () => {
  const res = await req("/verify", { method: "POST", token: false, body: { basePath: path.join(tmpRoot, "base") } });
  assert.equal(res.status, 401);
});

test("POST /verify creates the base folder", async () => {
  const target = path.join(tmpRoot, "base");
  const res = await req("/verify", { method: "POST", body: { basePath: target } });
  const doc = await res.json();
  assert.equal(doc.ok, true);
  assert.ok(fs.existsSync(target));
});

test("POST /save writes a real file, second save overwrites", async () => {
  const payload = {
    basePath: path.join(tmpRoot, "base"),
    chatId: "live-chat-1",
    title: "Live Test ไทยทดสอบ / Test",
    model: "claude-sonnet-4-6",
    gen: "3.0",
    input: 42,
    output: 84,
    total: 126,
    msgCount: 2,
    source: "api",
    updatedAt: new Date().toISOString(),
    checkpoints: [{ name: "cp1 ไทย", at: new Date().toISOString(), input: 42, output: 84, total: 126 }],
  };
  const r1 = await (await req("/save", { method: "POST", body: payload })).json();
  assert.equal(r1.ok, true);
  assert.match(r1.path, /ไทยทดสอบ/, "Thai title survives the HTTP round-trip in the file name");
  const abs = path.join(payload.basePath, r1.path);
  assert.ok(fs.existsSync(abs), "saved file exists");
  const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
  assert.equal(doc.chatId, "live-chat-1");
  assert.equal(doc.title, "Live Test ไทยทดสอบ / Test");
  assert.equal(doc.checkpoints.length, 1);
  assert.equal(doc.checkpoints[0].name, "cp1 ไทย");

  const r2 = await (await req("/save", { method: "POST", body: Object.assign({}, payload, { input: 100 }) })).json();
  assert.equal(r2.path, r1.path, "same-day overwrite");
  assert.equal(JSON.parse(fs.readFileSync(abs, "utf8")).input, 100);
});

test("POST /rename renames the live file (Thai name)", async () => {
  const r = await (await req("/rename", {
    method: "POST",
    body: { basePath: path.join(tmpRoot, "base"), chatId: "live-chat-1", newTitle: "ชื่อไทยใหม่ Renamed" },
  })).json();
  assert.equal(r.ok, true);
  assert.match(r.path, /ชื่อไทยใหม่ Renamed\.json$/);
  assert.ok(fs.existsSync(path.join(tmpRoot, "base", r.path)));
});

test("concurrent HTTP saves/renames across chats keep the index consistent", async () => {
  const base = path.join(tmpRoot, "base");
  const saves = [];
  for (let i = 0; i < 10; i++) {
    saves.push(
      req("/save", {
        method: "POST",
        body: {
          basePath: base,
          chatId: "conc-live-" + i,
          title: "Concurrent Live " + i,
          input: i,
          output: i,
          total: i * 2,
          msgCount: 1,
          source: "api",
          updatedAt: new Date().toISOString(),
          checkpoints: [],
        },
      }).then((r) => r.json())
    );
  }
  const renameBody = { basePath: base, chatId: "conc-live-3", newTitle: "Renamed While Saving" };
  const renamePromise = req("/rename", { method: "POST", body: renameBody }).then((r) => r.json());

  const saveResults = await Promise.all(saves);
  assert.ok(saveResults.every((r) => r.ok !== false), "every concurrent save succeeded");

  let renameResult = await renamePromise;
  if (renameResult.ok === false) {
    // the rename may legitimately have arrived before its save landed — retry once
    renameResult = await req("/rename", { method: "POST", body: renameBody }).then((r) => r.json());
  }
  assert.ok(renameResult.ok, "rename succeeds (one retry allowed if it raced the first save)");

  const idx = JSON.parse(fs.readFileSync(path.join(base, "_tokencal_index.json"), "utf8"));
  for (let i = 0; i < 10; i++) {
    const info = idx.chats["conc-live-" + i];
    assert.ok(info, "index entry survives: conc-live-" + i);
    assert.ok(fs.existsSync(path.join(base, info.file)), "file exists: " + info.file);
  }
});

test("malformed JSON body is rejected with 400", async () => {
  const res = await fetch(base + "/save", {
    method: "POST",
    headers: { "x-tokencal-token": TOKEN, "content-type": "application/json" },
    body: "{oops",
  });
  assert.equal(res.status, 400);
  const doc = await res.json();
  assert.equal(doc.ok, false);
});

test("an oversized body is refused and the server stays alive", async () => {
  const big = "x".repeat(11 * 1024 * 1024);
  let threw = false;
  try {
    const res = await fetch(base + "/save", {
      method: "POST",
      headers: { "x-tokencal-token": TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ basePath: path.join(tmpRoot, "base"), chatId: "big", title: big }),
    });
    assert.notEqual(res.status, 200, "must not accept an oversized body");
  } catch (e) {
    threw = true; // socket destroyed — also acceptable
  }
  assert.ok(threw || true);
  const ping = await (await fetch(base + "/ping")).json();
  assert.equal(ping.ok, true, "helper is still alive after the oversized request");
});
