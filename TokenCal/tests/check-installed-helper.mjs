// Diagnostics for the *installed* TokenCal helper on 127.0.0.1:3210.
// Run: node tests/check-installed-helper.mjs [--port 3210] [--selftest <tempBasePath>]
// Without --selftest it only pings and pairs (reads nothing, writes nothing).
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const port = Number(getArg("--port", "3210"));
const base = `http://127.0.0.1:${port}`;

try {
  const ping = await (await fetch(base + "/ping")).json();
  console.log(`✅ helper online: v${ping.version}, uptime ${(ping.uptime / 1000).toFixed(1)}s`);
  const pair = await (await fetch(base + "/pair")).json();
  console.log(`✅ pair: token ${pair.token.slice(0, 8)}… (Node ${pair.node}, ${pair.platform})`);

  const selftest = getArg("--selftest", null);
  if (selftest) {
    const headers = { "x-tokencal-token": pair.token, "content-type": "application/json" };
    const v = await (await fetch(base + "/verify", { method: "POST", headers, body: JSON.stringify({ basePath: selftest }) })).json();
    console.log(`✅ verify: ${v.resolved}`);
    const payload = {
      basePath: selftest,
      chatId: "selftest-chat",
      title: "ตรวจสอบระบบ ภาษาไทย OK",
      input: 1,
      output: 2,
      total: 3,
      msgCount: 1,
      source: "selftest",
      updatedAt: new Date().toISOString(),
      checkpoints: [],
    };
    const s = await (await fetch(base + "/save", { method: "POST", headers, body: JSON.stringify(payload) })).json();
    console.log(`✅ save: ${s.path}`);
    const doc = JSON.parse(fs.readFileSync(path.join(selftest, s.path), "utf8"));
    if (doc.title !== "ตรวจสอบระบบ ภาษาไทย OK") throw new Error("Thai title did not survive the round-trip");
    const r = await (await fetch(base + "/rename", { method: "POST", headers, body: JSON.stringify({ basePath: selftest, chatId: "selftest-chat", newTitle: "เปลี่ยนชื่อแล้ว OK" }) })).json();
    console.log(`✅ rename: ${r.path}`);
    fs.rmSync(selftest, { recursive: true, force: true });
    console.log("✅ selftest passed, temp files cleaned up");
  }
} catch (e) {
  console.error("❌ helper check failed:", e.message);
  console.error("   เปิด helper ด้วย start-helper-windows.bat / start-helper-macos.command แล้วลองใหม่");
  process.exit(1);
}
