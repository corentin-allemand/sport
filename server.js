#!/usr/bin/env node
'use strict';

// Serveur de dev de l'app Sport : sert public/ en statique, rien d'autre.
// Toutes les données vivent sur l'appareil (IndexedDB) : aucune API.
// Zéro dépendance : modules natifs Node uniquement.

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 4321;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.woff2': 'font/woff2',
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

// ---------- fichiers statiques ----------

async function statSafe(file) {
  try {
    return await fsp.stat(file);
  } catch {
    return null;
  }
}

// Analyse d'un en-tête Range. Renvoie null (pas de Range ou syntaxe ignorée),
// 'invalid' (hors bornes, 416) ou { start, end } (bornes incluses).
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null; // plages multiples ou syntaxe inconnue : réponse complète
  let start;
  let end;
  if (m[1] === '') {
    const n = Number(m[2]); // suffixe : les n derniers octets
    if (n === 0 || size === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || (m[2] !== '' && Number(m[2]) < start)) return 'invalid';
  }
  return { start, end };
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Requête invalide');
  }
  if (decoded.includes('\0')) return sendText(res, 400, 'Requête invalide');

  // Protection path traversal : le chemin résolu doit rester dans public/.
  const target = path.resolve(PUBLIC_DIR, '.' + decoded);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, 'Interdit');
  }

  let file = target;
  let st = await statSafe(file);
  if (st && st.isDirectory()) {
    file = path.join(file, 'index.html');
    st = await statSafe(file);
  }
  if (!st || !st.isFile()) return sendText(res, 404, 'Introuvable');

  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': decoded.startsWith('/media/') ? 'public, max-age=86400' : 'no-cache',
  };

  // Requête Range (une seule plage) : indispensable pour la vidéo sur Safari iOS.
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  const range = parseRange(req.headers.range, st.size);
  if (range === 'invalid') {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}`, 'Content-Length': 0 });
    return res.end();
  }
  if (range) {
    ({ start, end } = range);
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = st.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  if (st.size === 0) return res.end();
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return undefined;
}

// ---------- serveur ----------

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, 'Erreur interne');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} déjà utilisé. Lance avec PORT=autre_port node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log('Sport démarré');
  console.log(`  Local : http://localhost:${PORT}`);
  if (lan.length === 0) {
    console.log('  Réseau : aucune IP LAN détectée');
  } else {
    for (const ip of lan) console.log(`  Réseau : http://${ip}:${PORT}`);
  }
  console.log('  Données : sur chaque appareil (IndexedDB), rien côté serveur');
});
