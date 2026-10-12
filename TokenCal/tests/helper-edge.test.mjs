// Edge-case + malicious-input tests for tokencal-helper.js.
// Run: node --test tests/helper-edge.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const helper = require("../tokencal-helper.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokencal-edge-"));
const T = new Date(2026, 9, 12, 15, 0);

test("Windows reserved device names are safe thanks to the timestamp prefix", () => {
  const base = path.join(tmpRoot, "reserved");
  for (const title of ["CON", "PRN", "AUX", "NUL", "COM1", "LPT9"]) {
    const res = helper.saveConversation({ basePath: base, chatId: "res-" + title, title, input: 1, output: 1, now: T });
    assert.equal(res.ok, true, `save with title ${title}`);
    assert.ok(fs.existsSync(path.join(base, res.path)), `file exists for ${title}`);
    assert.match(path.basename(res.path), new RegExp(` ${title}\\.json$`));
  }
});

test("dot-prefixed and odd titles stay inside the base dir and are not special", () => {
  const base = path.join(tmpRoot, "oddtitles");
  const cases = [
    [".secret", /\.secret\.json$/],
    ["...", /untitled(_odd-[0-9a-f]+)?\.json$/],
    ["   ", /untitled(_odd-[0-9a-f]+)?\.json$/],
    ["a\nb\tc", /a b c\.json$/],
    ["dot.name.here", /dot\.name\.here\.json$/],
  ];
  for (const [title, rx] of cases) {
    const res = helper.saveConversation({
      basePath: base,
      chatId: "odd-" + Buffer.from(title).toString("hex").slice(0, 12),
      title,
      input: 1,
      output: 1,
      now: T,
    });
    assert.equal(res.ok, true, `save ok for ${JSON.stringify(title)}`);
    assert.match(path.basename(res.path), rx, `name for ${JSON.stringify(title)}`);
  }
});

test("traversal via a tampered index cannot write outside the base dir", () => {
  const base = path.join(tmpRoot, "traversal-base");
  const outsideDir = path.join(tmpRoot, "traversal-outside");
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  // a file outside the base that claims to be ours (worst case)
  const victim = path.join(outsideDir, "evil.json");
  fs.writeFileSync(victim, JSON.stringify({ chatId: "victim" }), "utf8");

  const rel = path.relative(base, victim).split(path.sep).join("/");
  fs.writeFileSync(
    path.join(base, "_tokencal_index.json"),
    JSON.stringify({
      version: 1,
      chats: { victim: { file: rel, dateKey: "2026-10-12", firstSavedAt: T.toISOString(), updatedAt: null, title: "x" } },
    }),
    "utf8"
  );

  assert.throws(
    () => helper.saveConversation({ basePath: base, chatId: "victim", title: "x", input: 1, output: 1, now: T }),
    /outside basePath/,
    "refuses to overwrite a file outside the base path"
  );
  assert.equal(JSON.parse(fs.readFileSync(victim, "utf8")).chatId, "victim", "outside file untouched");
});

test("empty chatId is rejected", () => {
  assert.throws(() => helper.saveConversation({ basePath: path.join(tmpRoot, "x"), chatId: "", title: "t" }));
  assert.throws(() => helper.renameConversation({ basePath: path.join(tmpRoot, "x"), chatId: "", newTitle: "t" }));
});

test("rename with an empty title falls back to untitled and keeps the prefix", () => {
  const base = path.join(tmpRoot, "rename-empty");
  helper.saveConversation({ basePath: base, chatId: "re", title: "ก่อนแก้", input: 1, output: 1, now: T });
  const res = helper.renameConversation({ basePath: base, chatId: "re", newTitle: "" });
  assert.equal(res.ok, true);
  assert.match(path.basename(res.path), /^2026-10-12_15-00 untitled\.json$/);
});

test("very long titles are capped at 80 characters", () => {
  const base = path.join(tmpRoot, "longtitle");
  const res = helper.saveConversation({
    basePath: base,
    chatId: "long",
    title: "ย".repeat(500),
    input: 1,
    output: 1,
    now: T,
  });
  const name = path.basename(res.path).replace(/\.json$/, "");
  const titlePart = name.replace(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2} /, "");
  assert.equal(Array.from(titlePart).length, 80);
});

test("checkpoints payload is normalised to an array", () => {
  const base = path.join(tmpRoot, "ckpt");
  const res = helper.saveConversation({
    basePath: base,
    chatId: "ck",
    title: "cp",
    input: 1,
    output: 1,
    checkpoints: "not-an-array",
    now: T,
  });
  const doc = JSON.parse(fs.readFileSync(path.join(base, res.path), "utf8"));
  assert.deepEqual(doc.checkpoints, []);
});

test("a corrupted JSON file at the reuse path never blocks new saves", () => {
  const base = path.join(tmpRoot, "corrupt");
  const first = helper.saveConversation({ basePath: base, chatId: "cor", title: "C", input: 1, output: 1, now: T });
  fs.writeFileSync(path.join(base, first.path), "{broken", "utf8");
  const second = helper.saveConversation({ basePath: base, chatId: "cor", title: "C", input: 2, output: 2, now: T });
  assert.equal(second.ok, true);
  const doc = JSON.parse(fs.readFileSync(path.join(base, second.path), "utf8"));
  assert.equal(doc.input, 2);
  assert.equal(doc.chatId, "cor");
});

test("firstSavedAt on the same local day is reused even when its UTC date differs", () => {
  const base = path.join(tmpRoot, "midnight");
  const now = new Date(2026, 9, 12, 14, 0); // local afternoon
  const first = new Date(2026, 9, 12, 0, 30); // local 00:30 — UTC may fall on the previous day
  const res = helper.saveConversation({
    basePath: base,
    chatId: "mid",
    title: "Midnight",
    input: 1,
    output: 1,
    firstSavedAt: first.toISOString(),
    now,
  });
  assert.match(path.basename(res.path), /^2026-10-12_00-30 Midnight\.json$/);
});

function walkAll(dir, cb) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else cb(abs);
    }
  }
}

test("a corrupted index self-heals instead of duplicating the same-day file", () => {
  const base = path.join(tmpRoot, "idx-heal");
  const first = helper.saveConversation({ basePath: base, chatId: "heal", title: "Heal", input: 1, output: 1, now: T });
  fs.writeFileSync(path.join(base, "_tokencal_index.json"), "{bad json", "utf8");
  const second = helper.saveConversation({ basePath: base, chatId: "heal", title: "Heal", input: 2, output: 2, now: T });
  assert.equal(second.path, first.path, "same-day file reused after index corruption");
  let files = 0;
  walkAll(base, (abs) => {
    if (path.basename(abs) === "_tokencal_index.json") return;
    if (abs.endsWith(".json")) files++;
  });
  assert.equal(files, 1, "no duplicate file for the same chat/day");
  assert.equal(JSON.parse(fs.readFileSync(path.join(base, second.path), "utf8")).input, 2);
});

test("index self-heal keeps the local-day key across the UTC date boundary", () => {
  const base = path.join(tmpRoot, "idx-heal-midnight");
  const first = helper.saveConversation({
    basePath: base,
    chatId: "heal-mid",
    title: "HealMid",
    input: 1,
    output: 1,
    now: new Date(2026, 9, 12, 0, 30), // local 00:30 — UTC date may differ
  });
  fs.writeFileSync(path.join(base, "_tokencal_index.json"), "{bad", "utf8");
  const second = helper.saveConversation({
    basePath: base,
    chatId: "heal-mid",
    title: "HealMid",
    input: 2,
    output: 2,
    now: new Date(2026, 9, 12, 14, 0), // same local day, later
  });
  assert.equal(second.path, first.path, "same local-day file reused after rebuild");
});

test("deep base paths + long titles are capped to stay within the path budget", () => {
  const deepBase = path.join(tmpRoot, "a".repeat(60), "b".repeat(60));
  const res = helper.saveConversation({
    basePath: deepBase,
    chatId: "deep",
    title: "ย".repeat(200),
    input: 1,
    output: 1,
    now: T,
  });
  const abs = path.join(deepBase, res.path);
  assert.ok(fs.existsSync(abs), "file created");
  assert.ok(abs.length <= 240, `path within budget (got ${abs.length})`);
});

test("no .tmp files are left behind by atomic writes", () => {
  const base = path.join(tmpRoot, "tmpcheck");
  helper.saveConversation({ basePath: base, chatId: "t1", title: "T1", input: 1, output: 1, now: T });
  helper.renameConversation({ basePath: base, chatId: "t1", newTitle: "T2" });
  let tmps = 0;
  walkAll(base, (abs) => {
    if (abs.endsWith(".tmp")) tmps++;
  });
  assert.equal(tmps, 0);
});
