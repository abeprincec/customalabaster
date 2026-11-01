#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../lib/jsonc.js';
import { buildVariant } from '../lib/variants.js';

const repo = new URL('../../', import.meta.url);
const read = relative => parseJsonc(fs.readFileSync(new URL(relative, repo), 'utf8'));
const source = read('themes/Abraham-code-sandbox.json');
const palettes = read('playground/data/variant-palettes.json');
const check = process.argv.includes('--check');
for (const [suffix, config] of Object.entries(palettes)) {
  const relative = `themes/Abraham-code-sandbox-${suffix}.json`;
  const file = new URL(relative, repo);
  const current = read(relative);
  const next = buildVariant(source, current, config);
  const content = JSON.stringify(next, null, 2) + '\n';
  if (check) {
    if (fs.readFileSync(file, 'utf8') !== content) {
      console.error(`Out of date: ${relative}; run npm run generate:variants`);
      process.exitCode = 1;
    } else console.log(`Current: ${relative}`);
  } else {
    fs.writeFileSync(file, content);
    console.log(`Generated: ${fileURLToPath(file)}`);
  }
}
