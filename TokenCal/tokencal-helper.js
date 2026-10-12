#!/usr/bin/env node
/*
 * tokencal-helper.js — local companion for the TokenCal userscript.
 *
 * Runs a tiny HTTP server on 127.0.0.1 (localhost only) so the userscript can
 * auto-save per-chat token reports into  <basePath>/Y<ISO-year>/M<MM>/W<WW>/D<DD>/
 * and rename files when the chat title changes. Windows + macOS.
 *
 * Zero dependencies. Node 18+.
 *
 * Usage:
 *   node tokencal-helper.js [--port 3210] [--config <path-to-config.json>]
 *
 * The first run writes tokencal-helper.config.json (random token, port 3210)
 * next to this script. The userscript pairs automatically (GET /pair).
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const VERSION = "1.1.2";
const INDEX_FILE = "_tokencal_index.json";
const LOG_FILE = "tokencal-helper.log";
const LOG_MAX_BYTES = 1024 * 1024;
const BODY_LIMIT = 10 * 1024 * 1024;
const MAX_SCAN_FILES = 20000;
const TITLE_MAX = 80;

// ---------------------------------------------------------------- utilities

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** ISO-8601 week parts for a local Date: { isoYear, isoWeek, isoDay } */
function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { isoYear, isoWeek, isoDay: dayNum };
}

/** "YYYY-MM-DD" for a local Date */
function ymd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM-DD_HH-mm" (local) */
function timePrefix(date) {
  return `${ymd(date)}_${pad2(date.getHours())}-${pad2(date.getMinutes())}`;
}

/** "Y2026/M10/W42/D12" (relative, forward slashes) */
function dayDirFor(date) {
  const { isoYear, isoWeek } = isoWeekParts(date);
  return ["Y" + isoYear, "M" + pad2(date.getMonth() + 1), "W" + pad2(isoWeek), "D" + pad2(date.getDate())].join("/");
}

/** File-system safe chat title for use inside a file name. */
function sanitizeTitle(title) {
  let s = String(title == null ? "" : title)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (s.length > TITLE_MAX) s = s.slice(0, TITLE_MAX).trim();
  return s || "untitled";
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

const PATH_BUDGET = 240; // keep absolute paths friendly to the Windows MAX_PATH limit

/** Shorten a title so dirAbs + "<time> <title><suffix>.json" stays within PATH_BUDGET. */
function capTitleForPath(dirAbs, timePart, title, suffix) {
  let t = sanitizeTitle(title);
  const overhead = path.join(dirAbs, `${timePart} ${suffix}.json`).length;
  const budget = PATH_BUDGET - overhead;
  if (budget < 1) return t; // absurdly deep base — nothing sensible left to trim
  if (t.length > budget) {
    t = t.slice(0, Math.max(10, budget)).trim().replace(/[. ]+$/g, "");
    if (!t) t = "untitled";
  }
  return t;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // atomic-ish write: temp file + rename, so a crash never leaves a half-written JSON
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function resolveBase(basePath) {
  if (typeof basePath !== "string" || !basePath.trim()) {
    throw new Error("basePath is required");
  }
  if (!path.isAbsolute(basePath)) {
    throw new Error("basePath must be an absolute path");
  }
  return path.resolve(basePath.trim());
}

function assertUnder(base, target) {
  const rel = path.relative(base, target);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("refusing to write outside basePath");
  }
}

function relSlash(base, abs) {
  return path.relative(base, abs).split(path.sep).join("/");
}

// ---------------------------------------------------------------- index

function indexPath(base) {
  return path.join(base, INDEX_FILE);
}

function indexLoad(base) {
  const p = indexPath(base);
  if (fs.existsSync(p)) {
    const doc = readJsonSafe(p);
    if (doc && doc.chats && typeof doc.chats === "object") return doc;
    // corrupt index (e.g. crash during an old write) — rebuild from the tree so the day's
    // file is still found and overwritten instead of duplicated
    const rebuilt = indexRebuild(base, { version: 1, chats: {} });
    try {
      indexSave(base, rebuilt);
    } catch (e) {
      /* read-only base — the rebuilt doc still works for this call */
    }
    return rebuilt;
  }
  return { version: 1, chats: {} };
}

function indexSave(base, doc) {
  writeJson(indexPath(base), doc);
}

/** Rebuild the index by scanning the tree (fallback when the index is lost). */
function indexRebuild(base, doc) {
  doc = doc || { version: 1, chats: {} };
  const found = {};
  let scanned = 0;
  const walk = (dir) => {
    if (scanned >= MAX_SCAN_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      if (scanned >= MAX_SCAN_FILES) return;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith("_")) continue;
        walk(abs);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".json") && ent.name !== INDEX_FILE) {
        scanned++;
        const data = readJsonSafe(abs);
        if (!data || !data.chatId) continue;
        const prev = found[data.chatId];
        const stamp = data.lastSavedAt || data.updatedAt || "";
        if (!prev || stamp > prev.stamp) {
          const last = new Date(data.lastSavedAt || data.updatedAt || NaN);
          found[data.chatId] = {
            file: relSlash(base, abs),
            dateKey: !Number.isNaN(last.getTime()) ? ymd(last) : ymd(new Date()),
            title: data.title || null,
            firstSavedAt: data.firstSavedAt || null,
            updatedAt: data.lastSavedAt || null,
            stamp,
          };
        }
      }
    }
  };
  walk(base);
  for (const [chatId, info] of Object.entries(found)) {
    info.stamp = undefined;
    doc.chats[chatId] = info;
  }
  return doc;
}

// ---------------------------------------------------------------- core actions

/**
 * Save (or overwrite today's) report file for one chat.
 * All inputs come from the userscript. `now` is injectable for tests.
 */
function saveConversation(opts) {
  const base = resolveBase(opts.basePath);
  const chatId = String(opts.chatId || "");
  if (!chatId) throw new Error("chatId is required");
  const now = opts.now instanceof Date ? opts.now : new Date();
  const dateKey = ymd(now);

  const info = indexLoad(base);
  let entry = info.chats[chatId];
  let absFile = null;
  let firstSavedAt = null;
  let created = false;

  if (entry && entry.dateKey === dateKey && entry.file) {
    const candidate = path.resolve(base, entry.file);
    if (fs.existsSync(candidate)) {
      const existingDoc = readJsonSafe(candidate);
      // never overwrite a file that belongs to a different chat (stale/corrupt index guard)
      if (!existingDoc || !existingDoc.chatId || String(existingDoc.chatId) === chatId) {
        absFile = candidate;
        firstSavedAt = entry.firstSavedAt || null;
      }
    }
  }

  if (!absFile) {
    // same-local-day check (filenames and index use local dates; firstSavedAt is ISO UTC)
    let reuseFirst = null;
    if (opts.firstSavedAt) {
      const d = new Date(opts.firstSavedAt);
      if (!Number.isNaN(d.getTime()) && ymd(d) === dateKey) reuseFirst = opts.firstSavedAt;
    }
    firstSavedAt = reuseFirst || now.toISOString();

    const dirAbs = path.resolve(base, dayDirFor(now));
    assertUnder(base, path.join(dirAbs, "x"));
    fs.mkdirSync(dirAbs, { recursive: true });

    const t = new Date(firstSavedAt);
    const timePart = timePrefix(t);
    let name = `${timePart} ${capTitleForPath(dirAbs, timePart, opts.title, "")}.json`;
    let abs = path.join(dirAbs, name);
    if (fs.existsSync(abs)) {
      const other = readJsonSafe(abs);
      if (!other || String(other.chatId) !== chatId) {
        const suffix = `_${chatId.slice(0, 8)}`;
        name = `${timePart} ${capTitleForPath(dirAbs, timePart, opts.title, suffix)}${suffix}.json`;
        abs = path.join(dirAbs, name);
      }
    }
    absFile = abs;
    created = true;
  }

  assertUnder(base, absFile);

  const nowIso = opts.updatedAt && typeof opts.updatedAt === "string" ? opts.updatedAt : now.toISOString();
  const content = {
    app: "TokenCal",
    version: VERSION,
    chatId,
    title: opts.title || null,
    model: opts.model || null,
    gen: opts.gen || null,
    input: Number(opts.input) || 0,
    output: Number(opts.output) || 0,
    total: Number(opts.total) || (Number(opts.input) || 0) + (Number(opts.output) || 0),
    msgCount: opts.msgCount == null ? null : Number(opts.msgCount),
    source: opts.source || null,
    updatedAt: nowIso,
    firstSavedAt,
    lastSavedAt: nowIso,
    checkpoints: Array.isArray(opts.checkpoints) ? opts.checkpoints : [],
  };
  writeJson(absFile, content);

  info.chats[chatId] = {
    file: relSlash(base, absFile),
    dateKey,
    title: content.title,
    firstSavedAt,
    updatedAt: nowIso,
  };
  indexSave(base, info);

  return { ok: true, path: info.chats[chatId].file, created, firstSavedAt };
}

/** Rename the chat's file(s), keeping the date/time prefix. */
function renameConversation(opts) {
  const base = resolveBase(opts.basePath);
  const chatId = String(opts.chatId || "");
  if (!chatId) throw new Error("chatId is required");
  const newTitle = opts.newTitle || "";

  const info = indexLoad(base);
  let entry = info.chats[chatId];
  let absFile = entry && entry.file ? path.resolve(base, entry.file) : null;
  if (!absFile || !fs.existsSync(absFile)) {
    indexRebuild(base, info);
    entry = info.chats[chatId];
    absFile = entry && entry.file ? path.resolve(base, entry.file) : null;
  }
  if (!absFile || !fs.existsSync(absFile)) {
    return { ok: false, error: "file not found for this chat yet (will be created on next save)" };
  }
  assertUnder(base, absFile);

  const dir = path.dirname(absFile);
  const oldName = path.basename(absFile);
  const m = oldName.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}) /);
  const prefix = m ? m[1] : timePrefix(new Date());

  let newName = `${prefix} ${capTitleForPath(dir, prefix, newTitle, "")}.json`;
  let absNew = path.join(dir, newName);
  if (absNew !== absFile && fs.existsSync(absNew)) {
    const other = readJsonSafe(absNew);
    if (!other || String(other.chatId) !== chatId) {
      const suffix = `_${chatId.slice(0, 8)}`;
      newName = `${prefix} ${capTitleForPath(dir, prefix, newTitle, suffix)}${suffix}.json`;
      absNew = path.join(dir, newName);
    }
  }

  if (absNew !== absFile) fs.renameSync(absFile, absNew);

  const content = readJsonSafe(absNew) || {};
  content.title = newTitle;
  content.renamedAt = new Date().toISOString();
  writeJson(absNew, content);

  info.chats[chatId] = {
    file: relSlash(base, absNew),
    dateKey: entry ? entry.dateKey : ymd(new Date()),
    title: newTitle,
    firstSavedAt: entry ? entry.firstSavedAt : content.firstSavedAt || null,
    updatedAt: content.lastSavedAt || (entry && entry.updatedAt) || null,
  };
  indexSave(base, info);

  return { ok: true, path: info.chats[chatId].file, renamed: absNew !== absFile };
}

// ---------------------------------------------------------------- server

function loadConfig(configPath, cliPort) {
  const file = configPath || path.join(__dirname, "tokencal-helper.config.json");
  let config = readJsonSafe(file);
  if (!config) {
    config = { port: 3210, token: crypto.randomBytes(24).toString("hex") };
    writeJson(file, config);
  }
  if (!config.token) {
    config.token = crypto.randomBytes(24).toString("hex");
    writeJson(file, config);
  }
  if (cliPort) config.port = Number(cliPort);
  return { file, config };
}

function makeLogger(logPath) {
  return function log(...args) {
    const line = `[${new Date().toISOString()}] ${args.join(" ")}`;
    console.log(line);
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > LOG_MAX_BYTES) {
        fs.writeFileSync(logPath, "", "utf8");
      }
      fs.appendFileSync(logPath, line + "\n", "utf8");
    } catch (e) {
      /* logging must never crash the helper */
    }
  };
}

function startServer(opts) {
  const { port, token, log } = opts;
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    };
    const url = new URL(req.url, "http://127.0.0.1");
    const route = url.pathname;

    if (req.method === "GET" && route === "/pair") {
      return send(200, {
        ok: true,
        token,
        port,
        version: VERSION,
        node: process.version,
        platform: process.platform,
        suggestedBase: path.join(os.homedir(), "tokencal"),
      });
    }
    if (req.method === "GET" && route === "/ping") {
      return send(200, { ok: true, version: VERSION, startedAt: opts.startedAt, uptime: Date.now() - opts.startedAt });
    }
    if (req.method === "GET" && route === "/") {
      return send(200, { ok: true, hint: "TokenCal helper. Use /pair, /ping, POST /verify, POST /save, POST /rename." });
    }

    if (req.method !== "POST" || !["/verify", "/save", "/rename"].includes(route)) {
      return send(404, { ok: false, error: "not found" });
    }

    if (req.headers["x-tokencal-token"] !== token) {
      log(`auth failed: ${req.method} ${route} from ${req.socket.remoteAddress}`);
      return send(401, { ok: false, error: "bad token (run the pairing button in the TokenCal panel)" });
    }

    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch (e) {
        return send(400, { ok: false, error: "bad json" });
      }
      try {
        if (route === "/verify") {
          const base = resolveBase(body.basePath);
          fs.mkdirSync(base, { recursive: true });
          const writable = (() => {
            try {
              fs.accessSync(base, fs.constants.W_OK);
              return true;
            } catch (e) {
              return false;
            }
          })();
          if (!writable) return send(400, { ok: false, error: "folder is not writable" });
          log(`verify ok: ${base}`);
          return send(200, { ok: true, resolved: base });
        }
        if (route === "/save") {
          const out = saveConversation(body);
          log(`save ok: ${out.path} (${out.created ? "created" : "updated"}) chat=${body.chatId}`);
          return send(200, out);
        }
        if (route === "/rename") {
          const out = renameConversation(body);
          log(`rename -> ${out.ok ? out.path : out.error} chat=${body.chatId}`);
          return send(200, out);
        }
      } catch (e) {
        log(`ERROR ${route}: ${e.message}`);
        return send(500, { ok: false, error: e.message });
      }
    });
  });

  server.on("error", (e) => {
    log(`server error: ${e.message}`);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    log(`TokenCal helper v${VERSION} listening on http://127.0.0.1:${port}`);
    log(`config: ${opts.configFile}`);
  });
  return server;
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") out.port = argv[++i];
    else if (argv[i] === "--config") out.config = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tokencal-helper.js [--port 3210] [--config <file>]");
    return;
  }
  const { file, config } = loadConfig(args.config, args.port);
  const log = makeLogger(path.join(path.dirname(file), LOG_FILE));
  startServer({
    port: config.port,
    token: config.token,
    log,
    configFile: file,
    startedAt: Date.now(),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  VERSION,
  isoWeekParts,
  ymd,
  timePrefix,
  dayDirFor,
  sanitizeTitle,
  saveConversation,
  renameConversation,
  indexLoad,
  indexRebuild,
  loadConfig,
  startServer,
};
