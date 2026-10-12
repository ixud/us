// Unit tests for tokencal-helper.js — run: node --test tests/helper.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const helper = require("../tokencal-helper.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokencal-helper-test-"));

test("isoWeekParts matches Python reference fixtures", () => {
  const rows = JSON.parse(fs.readFileSync("tests/generated/iso-weeks.json", "utf8"));
  let checked = 0;
  for (const row of rows) {
    const [y, m, d] = row.date.split("-").map(Number);
    const parts = helper.isoWeekParts(new Date(y, m - 1, d));
    assert.equal(parts.isoYear, row.isoYear, `isoYear for ${row.date}`);
    assert.equal(parts.isoWeek, row.isoWeek, `isoWeek for ${row.date}`);
    assert.equal(parts.isoDay, row.isoDay, `isoDay for ${row.date}`);
    checked++;
  }
  assert.ok(checked > 2000, "fixture count");
});

test("isoWeekParts edge: 2027-01-01 belongs to ISO year 2026 week 53", () => {
  const p = helper.isoWeekParts(new Date(2027, 0, 1));
  assert.equal(p.isoYear, 2026);
  assert.equal(p.isoWeek, 53);
});

test("dayDirFor formats Y/M/W/D with padding", () => {
  assert.equal(helper.dayDirFor(new Date(2026, 9, 12)), "Y2026/M10/W42/D12");
  assert.equal(helper.dayDirFor(new Date(2026, 0, 1)), "Y2026/M01/W01/D01");
});

test("timePrefix formats YYYY-MM-DD_HH-mm", () => {
  assert.equal(helper.timePrefix(new Date(2026, 9, 12, 16, 30)), "2026-10-12_16-30");
  assert.equal(helper.timePrefix(new Date(2026, 9, 12, 9, 5)), "2026-10-12_09-05");
});

test("sanitizeTitle removes illegal chars and caps length", () => {
  assert.equal(helper.sanitizeTitle('a/b:c*d?e"f<g>h|i'), "a b c d e f g h i");
  assert.equal(helper.sanitizeTitle("  spaced   out  "), "spaced out");
  assert.equal(helper.sanitizeTitle("trailing...  "), "trailing");
  assert.equal(helper.sanitizeTitle(""), "untitled");
  assert.equal(helper.sanitizeTitle(null), "untitled");
  assert.equal(helper.sanitizeTitle("x".repeat(200)).length, 80);
});

test("saveConversation creates the ISO path, then overwrites same day", () => {
  const base = path.join(tmpRoot, "case-save");
  const day1 = new Date(2026, 9, 12, 16, 30);

  const r1 = helper.saveConversation({
    basePath: base,
    chatId: "chat-aaaa-1111",
    title: "My Chat / Test",
    model: "claude-sonnet-4-6",
    gen: "3.0",
    input: 100,
    output: 200,
    msgCount: 4,
    source: "api",
    now: day1,
  });
  assert.equal(r1.created, true);
  assert.equal(r1.path, "Y2026/M10/W42/D12/2026-10-12_16-30 My Chat Test.json");
  const abs1 = path.join(base, r1.path);
  assert.ok(fs.existsSync(abs1), "file created");
  const doc1 = JSON.parse(fs.readFileSync(abs1, "utf8"));
  assert.equal(doc1.chatId, "chat-aaaa-1111");
  assert.equal(doc1.total, 300);
  assert.equal(doc1.title, "My Chat / Test");
  assert.ok(fs.existsSync(path.join(base, "_tokencal_index.json")), "index created");

  const r2 = helper.saveConversation({
    basePath: base,
    chatId: "chat-aaaa-1111",
    title: "My Chat / Test",
    input: 150,
    output: 250,
    now: new Date(2026, 9, 12, 17, 45),
  });
  assert.equal(r2.created, false);
  assert.equal(r2.path, r1.path, "same file, overwritten");
  assert.equal(r2.firstSavedAt, r1.firstSavedAt, "firstSavedAt preserved");
  assert.equal(JSON.parse(fs.readFileSync(abs1, "utf8")).input, 150);
});

test("saveConversation creates a new file on the next day", () => {
  const base = path.join(tmpRoot, "case-nextday");
  helper.saveConversation({
    basePath: base,
    chatId: "chat-bbbb",
    title: "Day One",
    input: 1,
    output: 1,
    now: new Date(2026, 9, 12, 23, 59),
  });
  const r2 = helper.saveConversation({
    basePath: base,
    chatId: "chat-bbbb",
    title: "Day One",
    input: 2,
    output: 2,
    now: new Date(2026, 9, 13, 0, 1),
  });
  assert.equal(r2.created, true);
  assert.match(r2.path, /^Y2026\/M10\/W42\/D13\//);
});

test("same-titled chats get a chatId suffix instead of colliding", () => {
  const base = path.join(tmpRoot, "case-collision");
  const t = new Date(2026, 9, 12, 10, 0);
  const a = helper.saveConversation({ basePath: base, chatId: "aaaa1111-xxxx", title: "Same Name", input: 1, output: 1, now: t });
  const b = helper.saveConversation({ basePath: base, chatId: "bbbb2222-yyyy", title: "Same Name", input: 1, output: 1, now: t });
  assert.notEqual(a.path, b.path);
  assert.match(b.path, /Same Name_bbbb2222\.json$/);
});

test("renameConversation keeps the time prefix and updates title", () => {
  const base = path.join(tmpRoot, "case-rename");
  const t = new Date(2026, 9, 12, 14, 5);
  const saved = helper.saveConversation({ basePath: base, chatId: "chat-rr", title: "Old Name", input: 5, output: 6, now: t });
  const r = helper.renameConversation({ basePath: base, chatId: "chat-rr", newTitle: "New: Name?" });
  assert.equal(r.ok, true);
  assert.equal(r.renamed, true);
  assert.equal(r.path, "Y2026/M10/W42/D12/2026-10-12_14-05 New Name.json");
  assert.ok(!fs.existsSync(path.join(base, saved.path)), "old file gone");
  const doc = JSON.parse(fs.readFileSync(path.join(base, r.path), "utf8"));
  assert.equal(doc.title, "New: Name?");
  assert.ok(doc.renamedAt, "renamedAt stamped");

  const again = helper.renameConversation({ basePath: base, chatId: "chat-rr", newTitle: "New Name" });
  assert.equal(again.ok, true);
  assert.equal(again.renamed, false, "renaming to the same name is a no-op");
});

test("renameConversation reports missing files gracefully", () => {
  const base = path.join(tmpRoot, "case-rename-missing");
  fs.mkdirSync(base, { recursive: true });
  const r = helper.renameConversation({ basePath: base, chatId: "never-saved", newTitle: "x" });
  assert.equal(r.ok, false);
});

test("index rebuild recovers after the index file is deleted", () => {
  const base = path.join(tmpRoot, "case-rebuild");
  const t = new Date(2026, 9, 12, 11, 0);
  helper.saveConversation({ basePath: base, chatId: "chat-rebuild", title: "Recover Me", input: 3, output: 4, now: t });
  fs.unlinkSync(path.join(base, "_tokencal_index.json"));
  const r = helper.renameConversation({ basePath: base, chatId: "chat-rebuild", newTitle: "Renamed After Loss" });
  assert.equal(r.ok, true);
  assert.match(r.path, /Renamed After Loss\.json$/);
});

test("saveConversation rejects relative base paths", () => {
  assert.throws(() => helper.saveConversation({ basePath: "relative/dir", chatId: "c", title: "t" }));
});

test("saveConversation never overwrites a file that belongs to another chat", () => {
  const base = path.join(tmpRoot, "case-guard");
  const t1 = new Date(2026, 9, 12, 9, 0);
  const a = helper.saveConversation({ basePath: base, chatId: "chat-owner-a", title: "Guarded", input: 1, output: 1, now: t1 });
  const absA = path.join(base, a.path);

  // simulate a stale/corrupt index pointing at a file that belongs to someone else
  const doc = JSON.parse(fs.readFileSync(absA, "utf8"));
  doc.chatId = "another-chat";
  fs.writeFileSync(absA, JSON.stringify(doc), "utf8");

  const b = helper.saveConversation({
    basePath: base,
    chatId: "chat-owner-a",
    title: "Guarded",
    input: 2,
    output: 2,
    now: t1, // same minute -> identical candidate file name, forcing the collision path
  });
  assert.notEqual(b.path, a.path, "wrote a fresh file instead of clobbering");
  assert.match(b.path, /_chat-own\.json$/, "suffix disambiguates the name");
  assert.equal(JSON.parse(fs.readFileSync(absA, "utf8")).chatId, "another-chat", "other chat's file untouched");
});
