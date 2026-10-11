// Logique métier pure : dates, semaines, phases, statuts, statistiques.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Nombre de jours de a vers b (b - a), insensible aux changements d'heure.
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

// "Aujourd'hui", surchargeable par ?today=AAAA-MM-JJ pour tester.
export function todayISO() {
  try {
    const q = new URLSearchParams(location.search).get('today');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  } catch { /* rien */ }
  return toISO(new Date());
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', opts);
const fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fDay = fmt({ day: 'numeric', month: 'short' });
const fWeekday = fmt({ weekday: 'short' });

export const formatLong = (iso) => cap(fLong.format(parseISO(iso)));
export const formatShort = (iso) => cap(fShort.format(parseISO(iso)));
export const formatDay = (iso) => fDay.format(parseISO(iso));
export const formatWeekday = (iso) => cap(fWeekday.format(parseISO(iso)).replace('.', ''));

export function formatNumber(n, digits = 0) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

// Programme

export const weekCount = (db) => Number(db?.program?.weeks) || 13;

export function sortedSchedule(db) {
  return Object.entries(db?.program?.schedule || {})
    .sort((a, b) => a[1] - b[1])
    .map(([id, day]) => ({ id, day }));
}

export function weekState(db, today) {
  const n = weekCount(db);
  const d = diffDays(db.program.startDate, today);
  if (d < 0) return { before: true, daysToStart: -d, week: 1, raw: 0, after: false };
  const raw = Math.floor(d / 7) + 1;
  return { before: false, daysToStart: 0, week: Math.min(raw, n), raw, after: raw > n };
}

export function phaseOf(db, week) {
  return (db?.program?.phases || []).find((p) => (p.weeks || []).includes(week)) || null;
}

export const isTestWeek = (db, week) => (db?.program?.testWeeks || []).includes(week);

export function plannedDate(db, week, id) {
  const day = Number(db.program.schedule[id]) || 1;
  return addDays(db.program.startDate, (week - 1) * 7 + (day - 1));
}

export function weekRange(db, week) {
  const start = addDays(db.program.startDate, (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export const sessionById = (db, id) => (db?.sessions || []).find((s) => s.id === id) || null;
export const homeSessionOf = (db, id) => (db?.sessions || []).find((s) => s.kind === 'home' && s.homeOf === id) || null;
export const exerciseById = (db, id) => (db?.exercises || []).find((e) => e.id === id) || null;

// Bibliothèque, groupes, alternatives, remplacements (V2)

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const groupById = (db, id) => (db?.muscleGroups || []).find((g) => g.id === id) || null;
export const groupName = (db, id) => groupById(db, id)?.name || '';

export function exerciseHaystack(ex) {
  return norm([ex?.name, ex?.aka, ...(ex?.muscles || [])].filter(Boolean).join(' '));
}

export function alternativesOf(db, exId) {
  const ex = exerciseById(db, exId);
  if (!ex?.group) return [];
  return (db.exercises || []).filter((e) => e.id !== ex.id && e.group === ex.group);
}

export const swapKey = (sessionId, exId) => `${sessionId}/${exId}`;

// Exercice de remplacement choisi pour un item de séance, ou null.
export function swapFor(db, sessionId, exId) {
  const r = db?.preferences?.swaps?.[swapKey(sessionId, exId)];
  return r && r !== exId && exerciseById(db, r) ? r : null;
}

export const effectiveExerciseId = (db, sessionId, exId) => swapFor(db, sessionId, exId) || exId;

// Où un exercice est utilisé (séances, tests) : libellés lisibles.
export function exerciseUsage(cfg, exId) {
  const out = [];
  for (const s of cfg?.sessions || []) {
    const used = (s.blocks || []).some((b) => (b.items || []).some((it) => it.exerciseId === exId));
    if (used) out.push(`séance ${s.id}${s.name ? ` (${s.name})` : ''}`);
  }
  for (const t of cfg?.tests || []) if (t.exerciseId === exId) out.push(`test « ${t.name || t.id} »`);
  return out;
}

export function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function uniqueId(base, taken) {
  const root = base || 'element';
  let id = root;
  let i = 2;
  while (taken.has(id)) id = `${root}-${i++}`;
  return id;
}

export function findLog(db, date, id) {
  let best = null;
  for (const l of db?.logs || []) {
    if (l.date === date && l.sessionId === id) {
      if (!best || (l.createdAt || '') >= (best.createdAt || '')) best = l;
    }
  }
  return best;
}

export function entryFor(db, week, id, today) {
  const date = plannedDate(db, week, id);
  const log = findLog(db, date, id);
  let status;
  if (log && log.status === 'done') status = 'done';
  else if (log && log.status === 'skipped') status = 'skipped';
  else if (date === today) status = 'today';
  else if (date < today) status = 'missed';
  else status = 'upcoming';
  return { id, week, date, log, status, session: sessionById(db, id) };
}

export function weekEntries(db, week, today) {
  return sortedSchedule(db).map(({ id }) => entryFor(db, week, id, today));
}

export function allEntries(db, today) {
  const out = [];
  for (let w = 1; w <= weekCount(db); w++) out.push(...weekEntries(db, w, today));
  return out;
}

// Séance à mettre en avant : celle du jour, sinon la prochaine.
export function heroEntry(db, today) {
  const all = allEntries(db, today);
  const t = all.find((e) => e.date === today);
  if (t) return { entry: t, kind: 'today', inDays: 0 };
  const next = all.find((e) => e.date > today);
  if (next) return { entry: next, kind: 'next', inDays: diffDays(today, next.date) };
  return null;
}

// Prescriptions
// null = pas de prescription (item affiché sans), '' = masqué pour cette phase.
export function prescriptionFor(item, phaseId) {
  const p = item?.prescription;
  if (p == null) return null;
  if (typeof p === 'string') return p.trim();
  if (typeof p === 'object') {
    if (phaseId in p) return String(p[phaseId] ?? '').trim();
    if (phaseId === 'p4' && 'p1' in p) return String(p.p1 ?? '').trim();
    return '';
  }
  return String(p);
}

export function roundsFor(block, phaseId) {
  const r = block?.rounds;
  if (r == null) return null;
  if (typeof r === 'number') return r;
  if (typeof r === 'object') {
    if (r[phaseId] != null) return r[phaseId];
    if (phaseId === 'p4' && r.p1 != null) return r.p1;
  }
  return null;
}

// index : position d'origine du bloc et de l'item dans la séance (clé de progression).
export function visibleBlocks(session, phaseId) {
  return (session?.blocks || [])
    .map((b, bi) => {
      const items = (b.items || [])
        .map((it, ii) => ({ ...it, index: ii, rx: prescriptionFor(it, phaseId) }))
        .filter((it) => it.rx !== '');
      return { ...b, index: bi, items, roundsCount: roundsFor(b, phaseId) };
    })
    .filter((b) => b.items.length > 0);
}

// Séries à cocher (V4)

// Nombre de pastilles d'une prescription : "3 x 10" -> 3, "2 x 90 s + 1 x max" -> 3,
// "3 séries" -> 3, prescription libre ("1 min", "45 s", "x 20") -> 1 case.
export function setCount(rx) {
  const s = String(rx ?? '').trim();
  const m = s.match(/^(\d{1,2})\s*[x×]\s*\S/i);
  let n = 1;
  if (m) {
    n = Number(m[1]);
    for (const t of s.slice(m[0].length - 1).matchAll(/\+\s*(\d{1,2})\s*[x×]\s/gi)) n += Number(t[1]);
  } else {
    const m2 = s.match(/^(\d{1,2})\s+séries?(\s|$)/i);
    if (m2) n = Number(m2[1]);
  }
  return Math.min(Math.max(n, 1), 12);
}

export const progressKey = (week, sessionId, variant) => `${week}/${sessionId}/${variant === 'home' ? 'home' : 'gym'}`;

// Cases cochées d'une position, ramenées à n valeurs booléennes.
export function progressMarks(db, key, pos, n) {
  const arr = db?.progress?.[key]?.[pos];
  return Array.from({ length: n }, (_, i) => Array.isArray(arr) && arr[i] === true);
}

// Repos par défaut d'une phase, en secondes (program.restDefaults, sinon valeurs d'origine).
export const REST_FALLBACK = { p1: 75, p2: 120, p3: 90, p4: 75 };
export function restFor(db, phaseId) {
  const v = Number(db?.program?.restDefaults?.[phaseId]);
  if (Number.isInteger(v) && v > 0) return v;
  return REST_FALLBACK[phaseId] || 90;
}

export const autoRestOn = (db) => db?.preferences?.autoRest !== false;

// 75 -> "1 min 15", 120 -> "2 min", 45 -> "45 s"
export function formatRest(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (!m) return `${r} s`;
  return r ? `${m} min ${pad(r)}` : `${m} min`;
}

// Statistiques

export function stats(db, today) {
  const n = weekCount(db);
  const all = allEntries(db, today);
  const past = all.filter((e) => e.date < today || (e.date === today && e.log));
  const done = past.filter((e) => e.status === 'done').length;
  const pct = past.length ? Math.round((done / past.length) * 100) : null;

  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].status === 'done') streak++;
    else break;
  }

  const perWeek = [];
  for (let w = 1; w <= n; w++) {
    const es = all.filter((e) => e.week === w);
    perWeek.push({ week: w, done: es.filter((e) => e.status === 'done').length, total: es.length });
  }

  const rpes = (db.logs || []).filter((l) => l.status === 'done' && Number.isFinite(Number(l.rpe)) && l.rpe !== null && l.rpe !== '');
  const rpeAvg = rpes.length ? rpes.reduce((s, l) => s + Number(l.rpe), 0) / rpes.length : null;

  return { pct, done, total: past.length, streak, perWeek, rpeAvg, rpeCount: rpes.length };
}

export function testResult(db, week, testId) {
  return (db?.testResults || []).find((r) => Number(r.week) === Number(week) && r.testId === testId) || null;
}
