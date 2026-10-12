// Dev tool: renders the real panel/strip CSS+markup into a static preview page.
// Run: node tests/preview.mjs
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync("Claude.js", "utf8");

const cssMatch = src.match(/const CSS = `([\s\S]*?)`;/);
if (!cssMatch) throw new Error("CSS block not found");
const css = cssMatch[1];

const panelMatch = src.match(/panel\.innerHTML = `([\s\S]*?)`;/);
if (!panelMatch) throw new Error("panel template not found");
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const prefs = {
  collapsed: false, hidden: false, genOverride: "auto", includeThinking: false, auto: true,
  displayMode: "floating", basePath: "", helperToken: "", helperPort: 3210,
};
const panelHTML = new Function("prefs", "escapeHtml", "return `" + panelMatch[1] + "`;")(prefs, escapeHtml);

const stripMatch = src.match(/el\.innerHTML =\n([\s\S]*?);\n/);
if (!stripMatch) throw new Error("strip expression not found");
const stripHTML = new Function("return " + stripMatch[1] + ";")();

const LONG_TITLE = "ทดสอบชื่อแชทยาวมากๆ ระบบตรวจสอบโทเคน เวอร์ชันล่าสุด Long Chat Title Test";
const HARD_TITLE = "ไม่มีเว้นวรรคABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz_ตัวอักษรติดกันยาวๆไม่มีที่ตัด";

function fillPanel(html, opts = {}) {
  let out = html;
  out = out.replace('id="tk-in">0', 'id="tk-in">1,105,579');
  out = out.replace('id="tk-out">0', 'id="tk-out">977,123');
  out = out.replace('id="tk-total">0', 'id="tk-total">2,082,702');
  out = out.replace('id="tk-msgs">0', 'id="tk-msgs">342');
  out = out.replace('id="tk-status"></div>', 'id="tk-status">อัปเดตแล้ว (API)</div>');
  out = out.replace('id="tk-meta"></div>', 'id="tk-meta">Model: claude-sonnet-4-6 · Tokenizer: v3.0 · ที่มา: API · อัปเดต: 12/10/2026 18:45:12</div>');
  out = out.replace('id="tk-chat-title"></span>', 'id="tk-chat-title">' + (opts.hardTitle ? HARD_TITLE : LONG_TITLE) + "</span>");
  out = out.replace(
    'id="tk-mini-stats"></span>',
    'id="tk-mini-stats"><span class="tk-in-num">In 1,105,579</span> · <span class="tk-out-dot"></span><span class="tk-out-num">Out 977,123</span> · <span class="tk-total-num">Σ 2,082,702</span> · <span class="tk-turns-num">342 turns</span></span>'
  );
  out = out.replace('id="tk-sync-label" style="cursor:default;">📁 Sync: ปิด</span>', 'id="tk-sync-label" style="cursor:default;">📁 Sync: 🟢 2026-10-12_18-28 ตรวจสอบระบบ ภาษาไทย OK.json</span>');
  return out;
}

const wrapPanel = (html, cls) => `<div id="tokencal-panel"${cls ? ` class="${cls}"` : ""}>${html}</div>`;

let strip = stripHTML;
strip = strip.replace('data-role="in">0<', 'data-role="in">1,105,579<');
strip = strip.replace('data-role="out">Out 0<', 'data-role="out">Out 977,123<');
strip = strip.replace('data-role="total">Σ 0<', 'data-role="total">Σ 2,082,702<');
strip = strip.replace('data-role="turns">0 turns<', 'data-role="turns">342 turns<');
strip = strip.replace('class="tk-strip-dot"', 'class="tk-strip-dot online"');
strip = `<div id="tk-strip" title="TokenCal">${strip}</div>`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
${css}
body { background:#2b2b28; margin:0; padding:16px; font-family:sans-serif; }
.pv-wrap { display:flex; flex-wrap:wrap; gap:28px; align-items:flex-start; max-width: 1900px; }
.pv-title { font:600 13px sans-serif; margin-bottom:6px; color:#ddd; }
.pv-title + div { }
#tokencal-panel { position: static !important; left:auto !important; top:auto !important; right:auto !important; }
.pv-composer { width: 720px; border:2px dashed #777; border-radius:12px; padding:10px; background:#3a3a36; }
.pv-inputmock { border:1px solid #666; border-radius:8px; padding:10px; color:#aaa; font:13px sans-serif; margin-top:8px; }
</style></head>
<body>
<div class="pv-wrap">
  <div class="pv-col">
    <div class="pv-title">1) Floating EXPANDED</div>
    ${wrapPanel(fillPanel(panelHTML, {}), "")}
  </div>
  <div class="pv-col">
    <div class="pv-title">2) Floating COLLAPSED (mini)</div>
    ${wrapPanel(fillPanel(panelHTML, {}), "collapsed")}
  </div>
  <div class="pv-col">
    <div class="pv-title">3) Floating EXPANDED — extreme unbroken title</div>
    ${wrapPanel(fillPanel(panelHTML, { hardTitle: true }), "")}
  </div>
  <div class="pv-col">
    <div class="pv-title">4) Inline EXPANDED (embedded in composer)</div>
    <div class="pv-composer">
      ${wrapPanel(fillPanel(panelHTML, {}), "tk-embedded")}
      <div class="pv-inputmock">พิมพ์ข้อความ… (mock prompt)</div>
    </div>
  </div>
  <div class="pv-col">
    <div class="pv-title">5) Inline COLLAPSED (strip)</div>
    <div class="pv-composer">
      ${strip}
      <div class="pv-inputmock">พิมพ์ข้อความ… (mock prompt)</div>
    </div>
  </div>
</div>
</body></html>`;

const outDir = path.join("tests", "generated");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "panel-preview.html");
fs.writeFileSync(outFile, page, "utf8");
console.log("wrote", outFile);
