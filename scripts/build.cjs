"use strict";

// Replacement for `babel src --out-dir dist` (avoids @babel/cli -> chokidar -> picomatch).
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const srcDir = path.resolve(__dirname, "../src");
const outDir = path.resolve(__dirname, "../dist");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

for (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file);
  const out = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (/\.(js|mjs|cjs)$/.test(file)) {
    const { code } = babel.transformFileSync(file, { sourceFileName: file });
    fs.writeFileSync(out, code);
  } else {
    fs.copyFileSync(file, out);
  }
}
console.log(`Built ${path.relative(process.cwd(), outDir)}`);
