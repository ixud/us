// Injects tests/generated/unicode-tables.json into the marker region of Claude.js.
// Run: node tests/patch_tables.mjs
import fs from "node:fs";

const tables = JSON.parse(fs.readFileSync("tests/generated/unicode-tables.json", "utf8"));
const file = "Claude.js";
let src = fs.readFileSync(file, "utf8");

const START = "  //<<UNICODE_TABLES>>";
const END = "  //<</UNICODE_TABLES>>";
const s = src.indexOf(START);
const e = src.indexOf(END);
if (s < 0 || e < 0) throw new Error("UNICODE_TABLES markers not found in " + file);

const json = JSON.stringify(tables);
const block = START + "\n  const CTOK_UNICODE = " + json + ";\n" + END;
src = src.slice(0, s) + block + src.slice(e + END.length);
fs.writeFileSync(file, src);
console.log(`patched ${file}: tables ${(json.length / 1024).toFixed(1)} KiB`);
