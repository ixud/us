// Randomized operation fuzz for tokencal-helper.js with invariant checks.
// Run: node --test tests/helper-fuzz.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const helper = require("../tokencal-helper.js");

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walkJson(base, cb) {
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith(".json")) cb(abs);
    }
  }
}

function validateAll(base, knownChats) {
  const idx = helper.indexLoad(base);
  for (const [chatId, info] of Object.entries(idx.chats)) {
    assert.ok(knownChats.has(chatId), `index has unknown chat ${chatId}`);
    const abs = path.resolve(base, info.file);
    const rel = path.relative(base, abs);
    assert.ok(rel && !rel.startsWith("..") && !path.isAbsolute(rel), `index path inside base: ${info.file}`);
    assert.ok(fs.existsSync(abs), `index points at an existing file: ${info.file}`);
    const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
    assert.equal(String(doc.chatId), chatId, "chatId inside file matches its owner");
    const m = path.basename(abs).match(/^(\d{4}-\d{2}-\d{2})_/);
    assert.ok(m, `filename has a date prefix: ${info.file}`);
    assert.equal(m[1], helper.ymd(new Date(doc.firstSavedAt)), "file date prefix matches firstSavedAt (local date)");
  }

  const seenPaths = new Set();
  const perChatDay = new Map();
  walkJson(base, (abs) => {
    if (path.basename(abs) === "_tokencal_index.json") return;
    const rel = path.relative(base, abs).split(path.sep).join("/");
    assert.ok(!seenPaths.has(rel), `duplicate path ${rel}`);
    seenPaths.add(rel);
    const doc = JSON.parse(fs.readFileSync(abs, "utf8"));
    assert.ok(knownChats.has(String(doc.chatId)), `file with unknown chatId: ${rel}`);
    const m = path.basename(abs).match(/^(\d{4}-\d{2}-\d{2})_/);
    assert.ok(m, `filename has date prefix: ${rel}`);
    assert.equal(m[1], helper.ymd(new Date(doc.firstSavedAt)), `firstSavedAt matches prefix (local date): ${rel}`);
    const key = doc.chatId + "|" + m[1];
    perChatDay.set(key, (perChatDay.get(key) || 0) + 1);
  });
  for (const [key, n] of perChatDay) {
    assert.equal(n, 1, `exactly one file per chat per day: ${key} (found ${n})`);
  }
  return { fileCount: seenPaths.size };
}

test("fuzz: 400 random save/rename/day-rollover ops keep every invariant", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tokencal-fuzz-"));
  const rand = mulberry32(20261013);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const titlePool = [
    "Alpha", "Beta", "ชื่อไทย ทดสอบ", "CON", "PRN", "dot.name", "  spaced  ",
    "x".repeat(150), "a/b:c*d?e", "🇹🇭 emoji chat", "Tábłę ünïcode",
  ];
  const chats = [];
  for (let i = 0; i < 6; i++) {
    chats.push({
      chatId: "fuzz-chat-" + i,
      title: pick(titlePool),
      lastSent: 0,
    });
  }
  const known = new Set(chats.map((c) => c.chatId));

  let cur = new Date(2026, 9, 10, 9, 0);
  let saves = 0;
  let renames = 0;
  let dayRolls = 0;

  for (let op = 0; op < 400; op++) {
    if (rand() < 0.05) {
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 9, 0);
      dayRolls++;
    } else {
      cur = new Date(cur.getTime() + (1 + Math.floor(rand() * 120)) * 60000);
    }

    const chat = pick(chats);
    const roll = rand();

    if (roll < 0.15) {
      // rename (may legitimately fail if this chat has no file yet for the shape we check)
      chat.title = pick(titlePool);
      const res = helper.renameConversation({ basePath: base, chatId: chat.chatId, newTitle: chat.title });
      if (res.ok) {
        renames++;
        const idx = helper.indexLoad(base);
        const info = idx.chats[chat.chatId];
        assert.ok(info, "renamed chat is in the index");
        assert.ok(
          path.basename(info.file).includes(helper.sanitizeTitle(chat.title)),
          `renamed file carries the new title: ${info.file}`
        );
      }
    } else {
      // occasional silent title drift (rename not called) — filename may lag, that is allowed
      if (rand() < 0.2) chat.title = pick(titlePool);
      const input = 1 + Math.floor(rand() * 5000);
      const output = 1 + Math.floor(rand() * 9000);
      const res = helper.saveConversation({
        basePath: base,
        chatId: chat.chatId,
        title: chat.title,
        model: "claude-sonnet-4-6",
        gen: "3.0",
        input,
        output,
        total: input + output,
        msgCount: 1 + Math.floor(rand() * 40),
        source: "api",
        updatedAt: cur.toISOString(),
        checkpoints: [],
        now: cur,
      });
      assert.equal(res.ok, true, "save ok");
      saves++;
    }

    if (op % 20 === 0 || op === 399) {
      validateAll(base, known);
    }
  }

  const stats = validateAll(base, known);
  console.log(
    `fuzz done: ${saves} saves, ${renames} renames, ${dayRolls} day rolls, ${stats.fileCount} files`
  );
  assert.ok(saves > 250 && renames > 20 && dayRolls > 10, "ops happened");
});

test("fuzz: concurrent saves across chats never lose index entries", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tokencal-fuzz-conc-"));
  const now = new Date(2026, 9, 12, 12, 0);
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      Promise.resolve().then(() =>
        helper.saveConversation({
          basePath: base,
          chatId: "conc-" + i,
          title: "Concurrent " + i,
          input: i,
          output: i * 2,
          now,
        })
      )
    )
  );
  assert.equal(results.filter((r) => r.ok).length, 12);
  const known = new Set(Array.from({ length: 12 }, (_, i) => "conc-" + i));
  const stats = validateAll(base, known);
  assert.equal(stats.fileCount, 12, "all twelve files exist exactly once");
});
