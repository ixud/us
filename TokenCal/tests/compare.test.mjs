// Compares the JS ctok port (Claude.js) against generated ground truth.
// Run: node tests/compare.test.mjs
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { CTOK } = require("../Claude.js");

const docs = {
  v3: JSON.parse(fs.readFileSync("tests/data/pieces_v3.json", "utf8")),
  v4_7: JSON.parse(fs.readFileSync("tests/data/pieces_v4_7.json", "utf8")),
};
CTOK.setDocuments(docs);

const fixtures = JSON.parse(fs.readFileSync("tests/generated/fixtures.json", "utf8"));
const versions = ["3.0", "4.7", "4.8"];

let total = 0;
let mismatches = [];

const t0 = Date.now();
for (const c of fixtures) {
  for (const v of versions) {
    total++;
    const got = CTOK.tokenCount(c.text, v);
    const want = c.counts[v];
    if (got !== want) {
      mismatches.push({ text: c.text, version: v, want, got });
    }
  }
}
const elapsed = Date.now() - t0;

console.log(`cases: ${fixtures.length}, checks: ${total}, elapsed: ${elapsed}ms`);

if (mismatches.length === 0) {
  console.log("ALL MATCH");
  process.exit(0);
}

console.log(`MISMATCHES: ${mismatches.length}`);
for (const m of mismatches.slice(0, 25)) {
  console.log("----");
  console.log("text    :", JSON.stringify(m.text));
  console.log("version :", m.version, " want:", m.want, " got:", m.got);
  try {
    console.log("stream  :", JSON.stringify(CTOK.debugStream(m.text, m.version)));
  } catch (e) {
    console.log("stream  : <error>", e.message);
  }
}
process.exit(1);
