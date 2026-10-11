// Store local : toute la db vit sur l'appareil (IndexedDB, repli localStorage).
// Même interface que l'ancienne API serveur (db, saveLog, deleteLog, saveTest,
// deleteTest, saveSwap, saveConfig), mêmes règles métier.
// V4 : progress (cases cochées en séance) et preferences.autoRest, données utilisateur.
// Graine : data/program.json (programme de base), data/media.json (contenu de l'app, jamais stocké).

const DB_NAME = 'sport';
const STORE = 'kv';
const LS_PREFIX = 'sport.kv.';
const SEED_URL = 'data/program.json';
const MEDIA_URL = 'data/media.json';
const HISTORY_KEEP = 10;
const CONFIG_KEYS = ['program', 'exercises', 'sessions', 'tests', 'glossary', 'muscleGroups'];
const JOURNAL_KEYS = ['logs', 'testResults', 'preferences', 'progress'];
const TZ = 'Europe/Paris';

// ---------- erreurs (forme compatible avec l'ancienne API : status + data) ----------

class StoreError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.data = errors ? { error: message, errors } : { error: message };
  }
}

// ---------- utilitaires ----------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const parisDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayParis = () => parisDateFormat.format(new Date());

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function youtubeSearch(name) {
  const q = new URLSearchParams({ search_query: `${name} technique` });
  return `https://www.youtube.com/results?${q.toString()}`;
}

// ---------- persistance clé/valeur ----------

let idbPromise = null;

function openIdb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

async function kvGet(key) {
  const idb = await openIdb();
  if (idb) {
    return new Promise((resolve, reject) => {
      const req = idb.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  const idb = await openIdb();
  if (idb) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    throw new StoreError(507, 'stockage local plein ou indisponible');
  }
  return undefined;
}

// ---------- graine et médias ----------

let seedCache = null;
let mediaCache = null;

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSeed() {
  if (!seedCache) seedCache = await fetchJson(SEED_URL);
  return seedCache;
}

async function loadMedia() {
  if (mediaCache) return mediaCache;
  try {
    const m = await fetchJson(MEDIA_URL);
    mediaCache = isPlainObject(m) ? m : {};
  } catch {
    return {}; // réessayé au prochain chargement
  }
  return mediaCache;
}

function seedConfig(seed) {
  const o = {};
  for (const k of CONFIG_KEYS) o[k] = structuredClone(seed[k] ?? (k === 'program' ? {} : []));
  return o;
}

function freshDb(seed) {
  return {
    programVersion: Number(seed.programVersion) || 1,
    ...seedConfig(seed),
    logs: [],
    testResults: [],
    preferences: { swaps: {} },
    progress: {},
  };
}

// ---------- état en mémoire, écritures sérialisées ----------

let local = null; // db locale (config + journal + programVersion + configEditedAt)
let meta = null; // { firstRunAt, lastExportAt, persistAsked }
let notice = null; // message à afficher une fois
let ready = null;
let writeChain = Promise.resolve();

async function init() {
  meta = (await kvGet('meta')) || {};
  local = await kvGet('db');
  if (!local) {
    local = freshDb(await loadSeed());
    meta.firstRunAt = new Date().toISOString();
    await kvSet('db', local);
    await kvSet('meta', meta);
  } else {
    await checkProgramUpdate();
  }
}

function ensureReady() {
  if (!ready) ready = init().catch((err) => { ready = null; throw err; });
  return ready;
}

function mutate(fn) {
  const run = writeChain.then(async () => {
    await ensureReady();
    const draft = structuredClone(local);
    const result = await fn(draft); // lève StoreError si invalide : rien n'est écrit
    await kvSet('db', draft);
    local = draft;
    return result;
  });
  writeChain = run.catch(() => {});
  return run;
}

async function saveMeta(patch) {
  meta = { ...(meta || {}), ...patch };
  await kvSet('meta', meta);
}

// ---------- mises à jour du programme ----------

// Ajoute à la liste locale les éléments de la graine absents (clé = id, ou term pour le glossaire).
function addMissing(list, seedList, key) {
  const out = Array.isArray(list) ? list : [];
  const seen = new Set(out.map((x) => x?.[key]));
  let added = 0;
  for (const item of Array.isArray(seedList) ? seedList : []) {
    if (isPlainObject(item) && item[key] && !seen.has(item[key])) {
      out.push(structuredClone(item));
      seen.add(item[key]);
      added++;
    }
  }
  return added;
}

// Repos par défaut (V4) : clés de phase absentes localement copiées depuis la graine.
function mergeRestDefaults(db, seed) {
  const from = seed?.program?.restDefaults;
  if (!isPlainObject(from) || !isPlainObject(db.program)) return;
  if (!isPlainObject(db.program.restDefaults)) db.program.restDefaults = {};
  for (const [k, v] of Object.entries(from)) {
    if (!(k in db.program.restDefaults)) db.program.restDefaults[k] = v;
  }
}

async function checkProgramUpdate() {
  let seed;
  try {
    seed = await loadSeed();
  } catch {
    return; // hors ligne sans cache : on garde la db locale telle quelle
  }
  const seedVersion = Number(seed.programVersion) || 1;
  if (seedVersion <= (Number(local.programVersion) || 0)) return;
  const db = structuredClone(local);
  if (!db.configEditedAt) {
    Object.assign(db, seedConfig(seed));
  } else {
    addMissing(db.muscleGroups, seed.muscleGroups, 'id');
    addMissing(db.exercises, seed.exercises, 'id');
    addMissing(db.tests, seed.tests, 'id');
    addMissing(db.glossary, seed.glossary, 'term');
    mergeRestDefaults(db, seed);
    notice = 'Programme mis à jour, tes modifications sont conservées';
  }
  db.programVersion = seedVersion;
  cleanSwaps(db);
  await kvSet('db', db);
  local = db;
}

// ---------- lecture enrichie ----------

function enrichDb(db, media) {
  const exercises = Array.isArray(db.exercises) ? db.exercises : [];
  return {
    ...structuredClone(db),
    muscleGroups: Array.isArray(db.muscleGroups) ? structuredClone(db.muscleGroups) : [],
    preferences: {
      ...(isPlainObject(db.preferences) ? structuredClone(db.preferences) : {}),
      swaps: isPlainObject(db.preferences) && isPlainObject(db.preferences.swaps) ? { ...db.preferences.swaps } : {},
    },
    exercises: exercises.map((ex) => {
      const m = isPlainObject(media[ex.id]) ? media[ex.id] : {};
      return {
        ...structuredClone(ex),
        media: {
          images: Array.isArray(m.images) ? m.images.filter((s) => typeof s === 'string') : [],
          video: typeof m.video === 'string' && m.video ? m.video : youtubeSearch(ex.name || ex.id || ''),
          ...(typeof m.animation === 'string' && m.animation ? { animation: m.animation } : {}),
        },
      };
    }),
  };
}

// ---------- validation (reprise de l'ancien serveur) ----------

function sessionExists(db, id) {
  return Array.isArray(db.sessions) && db.sessions.some((s) => s.id === id);
}

function validateLog(body, db) {
  const { date, sessionId, variant, status } = body || {};
  if (!isIsoDate(date)) throw new StoreError(400, 'date invalide (AAAA-MM-JJ attendu)');
  if (typeof sessionId !== 'string' || !sessionExists(db, sessionId)) throw new StoreError(400, 'sessionId inconnu');
  if (variant !== 'gym' && variant !== 'home') throw new StoreError(400, 'variant doit valoir gym ou home');
  if (status !== 'done' && status !== 'skipped') throw new StoreError(400, 'status doit valoir done ou skipped');
  let rpe = null;
  if (body.rpe !== undefined && body.rpe !== null) {
    if (!Number.isInteger(body.rpe) || body.rpe < 1 || body.rpe > 10) throw new StoreError(400, 'rpe doit être un entier de 1 à 10');
    rpe = body.rpe;
  }
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || body.note.length > 1000) {
      throw new StoreError(400, 'note doit être une chaîne de 1000 caractères au maximum');
    }
  }
  return { date, sessionId, variant, status, rpe, note: typeof body.note === 'string' ? body.note : '' };
}

function validateTest(body, db) {
  const weeks = Number(db.program && db.program.weeks) || 13;
  const { week, testId, value } = body || {};
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw new StoreError(400, `week doit être un entier de 1 à ${weeks}`);
  const tests = Array.isArray(db.tests) ? db.tests : [];
  if (typeof testId !== 'string' || !tests.some((t) => t.id === testId)) throw new StoreError(400, 'testId inconnu');
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new StoreError(400, 'value doit être un nombre');
  if (body.date !== undefined && !isIsoDate(body.date)) throw new StoreError(400, 'date invalide (AAAA-MM-JJ attendu)');
  return { week, testId, value, date: body.date === undefined ? todayParis() : body.date };
}

// Validation d'intégrité de la config : renvoie une liste d'erreurs lisibles (vide = valide).
export function validateConfig(body) {
  const errors = [];
  if (!isPlainObject(body)) return ['La configuration doit être un objet'];
  const { program, exercises, sessions, tests, glossary, muscleGroups } = body;

  for (const [key, val] of Object.entries({ exercises, sessions, tests, glossary, muscleGroups })) {
    if (!Array.isArray(val)) errors.push(`« ${key} » doit être une liste`);
  }
  if (!isPlainObject(program)) errors.push('« program » doit être un objet');
  if (errors.length) return errors;

  // Taxonomie des groupes musculaires
  const groupIds = new Set();
  muscleGroups.forEach((g, i) => {
    if (!isPlainObject(g) || typeof g.id !== 'string' || !g.id.trim()) {
      errors.push(`Groupe musculaire n°${i + 1} : identifiant manquant`);
      return;
    }
    if (typeof g.name !== 'string' || !g.name.trim()) errors.push(`Groupe musculaire « ${g.id} » : nom manquant`);
    if (groupIds.has(g.id)) errors.push(`Groupe musculaire « ${g.id} » : identifiant en double`);
    groupIds.add(g.id);
  });

  // Exercices
  const exIds = new Set();
  exercises.forEach((ex, i) => {
    if (!isPlainObject(ex) || typeof ex.id !== 'string' || !ex.id.trim()) {
      errors.push(`Exercice n°${i + 1} : identifiant manquant`);
      return;
    }
    if (exIds.has(ex.id)) errors.push(`Exercice « ${ex.id} » : identifiant en double`);
    exIds.add(ex.id);
    if (typeof ex.name !== 'string' || !ex.name.trim()) errors.push(`Exercice « ${ex.id} » : nom manquant`);
    if (typeof ex.group !== 'string' || !ex.group) {
      errors.push(`Exercice « ${ex.id} » : groupe musculaire manquant`);
    } else if (!groupIds.has(ex.group)) {
      errors.push(`Exercice « ${ex.id} » : groupe inconnu « ${ex.group} »`);
    }
  });

  // Séances
  const sessionIds = new Set();
  sessions.forEach((s, i) => {
    if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id.trim()) {
      errors.push(`Séance n°${i + 1} : identifiant manquant`);
      return;
    }
    if (sessionIds.has(s.id)) errors.push(`Séance « ${s.id} » : identifiant en double`);
    sessionIds.add(s.id);
    if (s.kind !== 'gym' && s.kind !== 'home') errors.push(`Séance « ${s.id} » : kind doit valoir gym ou home`);
    if (!Array.isArray(s.blocks)) {
      errors.push(`Séance « ${s.id} » : « blocks » doit être une liste`);
      return;
    }
    s.blocks.forEach((b, bi) => {
      const label = `Séance « ${s.id} », bloc n°${bi + 1}`;
      if (!isPlainObject(b) || !Array.isArray(b.items)) {
        errors.push(`${label} : « items » doit être une liste`);
        return;
      }
      b.items.forEach((it, ii) => {
        if (!isPlainObject(it) || typeof it.exerciseId !== 'string' || !it.exerciseId) {
          errors.push(`${label}, item n°${ii + 1} : exerciseId manquant`);
        } else if (!exIds.has(it.exerciseId)) {
          errors.push(`${label}, item n°${ii + 1} : exercice inconnu « ${it.exerciseId} »`);
        }
      });
    });
  });

  // Tests
  const testIds = new Set();
  tests.forEach((t, i) => {
    if (!isPlainObject(t) || typeof t.id !== 'string' || !t.id.trim()) {
      errors.push(`Test n°${i + 1} : identifiant manquant`);
      return;
    }
    if (testIds.has(t.id)) errors.push(`Test « ${t.id} » : identifiant en double`);
    testIds.add(t.id);
    if (t.exerciseId !== undefined && t.exerciseId !== null && !exIds.has(t.exerciseId)) {
      errors.push(`Test « ${t.id} » : exercice inconnu « ${t.exerciseId} »`);
    }
  });

  // Programme
  if (!isIsoDate(program.startDate)) errors.push('Programme : date de début invalide (AAAA-MM-JJ attendu)');
  if (!Number.isInteger(program.weeks) || program.weeks < 1) {
    errors.push('Programme : « weeks » doit être un entier supérieur ou égal à 1');
  }
  if (program.restDefaults !== undefined) {
    if (!isPlainObject(program.restDefaults)) {
      errors.push('Programme : « restDefaults » doit être un objet');
    } else {
      for (const [ph, sec] of Object.entries(program.restDefaults)) {
        if (!Number.isInteger(sec) || sec < 5 || sec > 900) {
          errors.push(`Programme : repos invalide pour la phase « ${ph} » (entier de 5 à 900 secondes attendu)`);
        }
      }
    }
  }
  if (!isPlainObject(program.schedule)) {
    errors.push('Programme : « schedule » doit être un objet');
  } else {
    for (const [sid, dow] of Object.entries(program.schedule)) {
      if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
        errors.push(`Programme : jour invalide pour la séance « ${sid} » (entier de 1 à 7 attendu)`);
      }
      if (!sessionIds.has(sid)) errors.push(`Programme : le planning référence une séance inconnue « ${sid} »`);
    }
    for (const s of sessions) {
      if (isPlainObject(s) && s.kind === 'gym' && !(s.id in program.schedule)) {
        errors.push(`Programme : la séance salle « ${s.id} » n'a pas de jour dans le planning`);
      }
    }
  }
  return errors;
}

// Retire des swaps ceux qui ne sont plus valides (séance, exercice ou groupe changés).
function cleanSwaps(db) {
  if (!isPlainObject(db.preferences)) db.preferences = {};
  if (!isPlainObject(db.preferences.swaps)) db.preferences.swaps = {};
  const groupOf = new Map((db.exercises || []).map((e) => [e.id, e.group]));
  const swaps = db.preferences.swaps;
  for (const [key, replacementId] of Object.entries(swaps)) {
    const i = key.indexOf('/');
    const sid = i === -1 ? '' : key.slice(0, i);
    const exId = i === -1 ? '' : key.slice(i + 1);
    const session = (db.sessions || []).find((s) => s.id === sid);
    const inSession = session && Array.isArray(session.blocks)
      && session.blocks.some((b) => Array.isArray(b.items) && b.items.some((it) => it.exerciseId === exId));
    const g = groupOf.get(exId);
    if (!inSession || !g || !groupOf.has(replacementId) || groupOf.get(replacementId) !== g) delete swaps[key];
  }
}

// Copie de la config courante dans l'historique (10 dernières).
async function pushHistory(db, reason) {
  const history = (await kvGet('history')) || [];
  const entry = { savedAt: new Date().toISOString(), reason, programVersion: db.programVersion, configEditedAt: db.configEditedAt || null };
  for (const k of CONFIG_KEYS) entry[k] = structuredClone(db[k]);
  history.push(entry);
  await kvSet('history', history.slice(-HISTORY_KEEP));
}

// ---------- progression en séance (V4) ----------

const PROGRESS_KEY = /^\d{1,3}\/[^/]+\/(gym|home)$/;
const PROGRESS_POS = /^\d{1,3}\/(\d{1,3}|r)$/;
const MAX_MARKS = 50;

// progress : { "<semaine>/<sessionId>/<gym|home>": { "<bloc>/<item>" ou "<bloc>/r": [bool, ...] } }
function validateProgress(progress) {
  if (!isPlainObject(progress)) return ['« progress » doit être un objet'];
  const errors = [];
  for (const [key, entry] of Object.entries(progress)) {
    if (!PROGRESS_KEY.test(key)) { errors.push(`progress : clé invalide « ${key} »`); continue; }
    if (!isPlainObject(entry)) { errors.push(`progress « ${key} » : objet attendu`); continue; }
    for (const [pos, marks] of Object.entries(entry)) {
      if (!PROGRESS_POS.test(pos)) errors.push(`progress « ${key} » : position invalide « ${pos} »`);
      else if (!Array.isArray(marks) || marks.length > MAX_MARKS || marks.some((m) => typeof m !== 'boolean')) {
        errors.push(`progress « ${key} », « ${pos} » : liste de booléens attendue`);
      }
    }
  }
  return errors.slice(0, 20);
}

// ---------- sauvegarde (export / import) ----------

function validateBackup(data) {
  if (!isPlainObject(data)) return ['Le fichier ne contient pas une sauvegarde Sport.'];
  const errors = validateConfig(data);
  if (data.logs !== undefined && !Array.isArray(data.logs)) errors.push('« logs » doit être une liste');
  if (data.testResults !== undefined && !Array.isArray(data.testResults)) errors.push('« testResults » doit être une liste');
  if (data.preferences !== undefined && !isPlainObject(data.preferences)) errors.push('« preferences » doit être un objet');
  if (data.progress !== undefined) errors.push(...validateProgress(data.progress));
  return errors;
}

// ---------- interface publique ----------

export const store = {
  async db() {
    await ensureReady();
    await writeChain;
    return enrichDb(local, await loadMedia());
  },

  saveLog(body) {
    return mutate((db) => {
      const entry = validateLog(body, db);
      if (!Array.isArray(db.logs)) db.logs = [];
      // Remplacement : un seul log par (date, sessionId).
      db.logs = db.logs.filter((l) => !(l.date === entry.date && l.sessionId === entry.sessionId));
      const log = { id: uuid(), ...entry, createdAt: new Date().toISOString() };
      db.logs.push(log);
      return log;
    });
  },

  deleteLog(id) {
    return mutate((db) => {
      const logs = Array.isArray(db.logs) ? db.logs : [];
      const idx = logs.findIndex((l) => l.id === id);
      if (idx === -1) throw new StoreError(404, 'log introuvable');
      logs.splice(idx, 1);
      db.logs = logs;
      return { ok: true, id };
    });
  },

  saveTest(body) {
    return mutate((db) => {
      const entry = validateTest(body, db);
      if (!Array.isArray(db.testResults)) db.testResults = [];
      // Remplacement : un seul résultat par (week, testId).
      db.testResults = db.testResults.filter((r) => !(r.week === entry.week && r.testId === entry.testId));
      const result = { id: uuid(), ...entry, createdAt: new Date().toISOString() };
      db.testResults.push(result);
      return result;
    });
  },

  deleteTest(id) {
    return mutate((db) => {
      const results = Array.isArray(db.testResults) ? db.testResults : [];
      const idx = results.findIndex((r) => r.id === id);
      if (idx === -1) throw new StoreError(404, 'résultat introuvable');
      results.splice(idx, 1);
      db.testResults = results;
      return { ok: true, id };
    });
  },

  saveSwap({ sessionId, exerciseId, replacementId } = {}) {
    return mutate((db) => {
      const session = typeof sessionId === 'string' && (db.sessions || []).find((s) => s.id === sessionId);
      if (!session) throw new StoreError(400, 'sessionId inconnu');
      const exercises = Array.isArray(db.exercises) ? db.exercises : [];
      const original = typeof exerciseId === 'string' && exercises.find((e) => e.id === exerciseId);
      if (!original) throw new StoreError(400, 'exerciseId inconnu');
      if (!session.blocks.some((b) => b.items.some((it) => it.exerciseId === exerciseId))) {
        throw new StoreError(400, 'exerciseId absent de cette séance');
      }
      if (replacementId !== null && typeof replacementId !== 'string') {
        throw new StoreError(400, 'replacementId doit être un identifiant ou null');
      }
      if (!isPlainObject(db.preferences)) db.preferences = {};
      if (!isPlainObject(db.preferences.swaps)) db.preferences.swaps = {};
      const key = `${sessionId}/${exerciseId}`;
      if (replacementId === null || replacementId === exerciseId) {
        delete db.preferences.swaps[key];
      } else {
        const repl = exercises.find((e) => e.id === replacementId);
        if (!repl) throw new StoreError(400, 'replacementId inconnu');
        if (!original.group || original.group !== repl.group) {
          throw new StoreError(400, "le remplaçant doit être du même groupe musculaire que l'exercice d'origine");
        }
        db.preferences.swaps[key] = replacementId;
      }
      return { swaps: { ...db.preferences.swaps } };
    });
  },

  // Cases cochées d'une position (bloc/item, ou bloc/r pour les tours). Tout décoché : la position disparaît.
  saveProgress(key, pos, marks) {
    return mutate((db) => {
      if (typeof key !== 'string' || !PROGRESS_KEY.test(key)) throw new StoreError(400, 'clé de progression invalide');
      if (typeof pos !== 'string' || !PROGRESS_POS.test(pos)) throw new StoreError(400, 'position invalide');
      if (!Array.isArray(marks) || marks.length > MAX_MARKS || marks.some((m) => typeof m !== 'boolean')) {
        throw new StoreError(400, 'liste de booléens attendue');
      }
      if (!isPlainObject(db.progress)) db.progress = {};
      const entry = isPlainObject(db.progress[key]) ? db.progress[key] : {};
      if (marks.some(Boolean)) entry[pos] = [...marks];
      else delete entry[pos];
      if (Object.keys(entry).length) db.progress[key] = entry;
      else delete db.progress[key];
      return { ok: true };
    });
  },

  resetProgress(key) {
    return mutate((db) => {
      if (isPlainObject(db.progress)) delete db.progress[key];
      return { ok: true };
    });
  },

  // Préférence : lancer le repos en cochant une série (activé par défaut).
  saveAutoRest(on) {
    return mutate((db) => {
      if (typeof on !== 'boolean') throw new StoreError(400, 'booléen attendu');
      if (!isPlainObject(db.preferences)) db.preferences = {};
      db.preferences.autoRest = on;
      return { autoRest: on };
    });
  },

  async saveConfig(body) {
    const media = await loadMedia();
    return mutate(async (db) => {
      const errors = validateConfig(body);
      if (errors.length) throw new StoreError(400, 'configuration invalide', errors);
      await pushHistory(db, 'save');
      for (const k of CONFIG_KEYS) db[k] = structuredClone(body[k]);
      db.configEditedAt = new Date().toISOString();
      cleanSwaps(db);
      return enrichDb(db, media);
    });
  },

  // Remet la config de la graine actuelle, sans toucher au journal.
  async resetProgram() {
    const seed = await loadSeed();
    return mutate(async (db) => {
      await pushHistory(db, 'reset');
      Object.assign(db, seedConfig(seed));
      db.programVersion = Number(seed.programVersion) || 1;
      delete db.configEditedAt;
      cleanSwaps(db);
    });
  },

  // Restaure la config enregistrée avant le dernier changement.
  async undoConfig() {
    return mutate(async (db) => {
      const history = (await kvGet('history')) || [];
      const prev = history.pop();
      if (!prev) throw new StoreError(404, 'aucune configuration précédente');
      for (const k of CONFIG_KEYS) db[k] = prev[k];
      if (prev.configEditedAt) db.configEditedAt = prev.configEditedAt;
      else delete db.configEditedAt;
      cleanSwaps(db);
      await kvSet('history', history);
    });
  },

  async historyCount() {
    return ((await kvGet('history')) || []).length;
  },

  async exportData() {
    await ensureReady();
    await writeChain;
    const out = { app: 'sport', exportedAt: new Date().toISOString(), ...structuredClone(local) };
    await saveMeta({ lastExportAt: out.exportedAt });
    return out;
  },

  // Remplace toute la db locale par une sauvegarde validée. Renvoie la liste d'erreurs (vide = fait).
  async importData(data) {
    const errors = validateBackup(data);
    if (errors.length) return errors;
    await mutate(async (db) => {
      await pushHistory(db, 'import');
      for (const k of Object.keys(db)) delete db[k];
      for (const k of CONFIG_KEYS) db[k] = structuredClone(data[k]);
      db.logs = Array.isArray(data.logs) ? structuredClone(data.logs) : [];
      db.testResults = Array.isArray(data.testResults) ? structuredClone(data.testResults) : [];
      db.preferences = isPlainObject(data.preferences) ? structuredClone(data.preferences) : {};
      db.progress = isPlainObject(data.progress) ? structuredClone(data.progress) : {};
      db.programVersion = Number(data.programVersion) || 1;
      if (data.configEditedAt) db.configEditedAt = data.configEditedAt;
      for (const k of JOURNAL_KEYS) if (db[k] === undefined) db[k] = k === 'preferences' || k === 'progress' ? {} : [];
      cleanSwaps(db);
    });
    await writeChain;
    await checkProgramUpdate();
    return [];
  },

  checkBackup: (data) => validateBackup(data),
  meta: () => ({ ...(meta || {}) }),
  programVersion: () => Number(local?.programVersion) || 0,
  configEdited: () => !!local?.configEditedAt,

  takeNotice() {
    const n = notice;
    notice = null;
    return n;
  },

  // Stockage persistant (évite l'éviction par le navigateur), demandé une seule fois.
  async requestPersist() {
    await ensureReady();
    if (meta.persistAsked) return;
    let granted = false;
    try { granted = await navigator.storage?.persist?.() ?? false; } catch { /* non supporté */ }
    await saveMeta({ persistAsked: new Date().toISOString(), persisted: !!granted });
  },
};
