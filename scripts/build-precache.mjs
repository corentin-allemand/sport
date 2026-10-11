#!/usr/bin/env node
// Génère public/precache.json (liste des fichiers à mettre en cache hors ligne)
// et écrit sa version (hash du contenu) dans public/sw.js.
// Zéro dépendance. Usage : node scripts/build-precache.mjs

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'precache.json');
const SW = path.join(PUBLIC, 'sw.js');

// Exclus : le SW lui-même, la liste générée, les fichiers système.
const EXCLUDE = new Set(['sw.js', 'precache.json']);
const IGNORE_NAME = /^\.|~$|\.tmp$/;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (IGNORE_NAME.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const toRel = (full) => path.relative(PUBLIC, full).split(path.sep).join('/');

const files = (await walk(PUBLIC)).map(toRel).filter((f) => !EXCLUDE.has(f)).sort();

// Contrôle : chaque image locale de media.json doit exister.
const media = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'media.json'), 'utf8'));
const listed = new Set(files);
const missing = [];
let remote = 0;
for (const [id, m] of Object.entries(media)) {
  for (const src of [...(m.images || []), ...(m.animation ? [m.animation] : [])]) {
    if (/^https?:/.test(src)) { remote++; continue; }
    if (!listed.has(src.replace(/^\.\//, ''))) missing.push(`${id} : ${src}`);
  }
}
if (missing.length) {
  console.error(`Fichiers média introuvables dans public/ :\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// Version = hash du chemin et du contenu de chaque fichier.
const hash = createHash('sha256');
let bytes = 0;
for (const f of files) {
  const buf = await readFile(path.join(PUBLIC, f));
  bytes += (await stat(path.join(PUBLIC, f))).size;
  hash.update(f).update('\0').update(buf).update('\0');
}
const version = hash.digest('hex').slice(0, 12);

await writeFile(OUT, JSON.stringify({ version, files }, null, 2) + '\n');

const sw = await readFile(SW, 'utf8');
const re = /const VERSION = '[^']*';/;
if (!re.test(sw)) {
  console.error('public/sw.js : ligne « const VERSION = ... » introuvable');
  process.exit(1);
}
await writeFile(SW, sw.replace(re, `const VERSION = '${version}';`));

console.log(`precache.json : ${files.length} fichiers, ${(bytes / 1024 / 1024).toFixed(1)} Mo, version ${version}`);
if (remote) console.warn(`Attention : ${remote} média(s) distant(s) non mis en cache hors ligne.`);
