import { store } from './js/store.js';
import { downloadCalendar } from './js/ics.js';
import { initServiceWorker } from './js/sw-client.js';
import * as L from './js/logic.js';
import { esc, icon, thumb, toast, openSheet, closeSheet } from './js/ui.js';
import { viewToday } from './js/view-today.js';
import { viewSessions } from './js/view-sessions.js';
import { viewSession, resolveVariant } from './js/view-session.js';
import { viewExercise } from './js/view-exercise.js';
import { viewProgress, formatValue, unitLabel } from './js/view-progress.js';
import { viewLibrary } from './js/view-library.js';
import { viewConfig, configDirty, openLeaveGuard, setConfigSection } from './js/view-config.js';

const state = { db: null, loading: true, failed: false, variants: {}, cleanup: null, lastPath: null, lastTab: null, navCount: 0 };
const view = document.getElementById('view');

// Données : tout est sur l'appareil (js/store.js).

// Ancien cache de la version serveur, devenu inutile.
try { localStorage.removeItem('sport.db.v1'); } catch { /* rien */ }

async function load({ silent = false } = {}) {
  try {
    const db = await store.db();
    if (!db || !db.program) throw new Error('Données invalides');
    state.db = db;
    state.failed = false;
    const notice = store.takeNotice();
    if (notice) toast(notice);
  } catch (err) {
    console.warn(err);
    if (!state.db) state.failed = true;
    else if (!silent) toast('Lecture des données impossible, réessaie');
  }
  state.loading = false;
}

async function resync() {
  await load({ silent: true });
  render(false);
}

const tmpId = () => `tmp-${Math.random().toString(36).slice(2)}`;

async function mutate(apply, request, errorMsg) {
  const snapshot = structuredClone({ logs: state.db.logs || [], testResults: state.db.testResults || [], preferences: state.db.preferences || {} });
  apply();
  render(false);
  try {
    await request();
  } catch {
    state.db.logs = snapshot.logs;
    state.db.testResults = snapshot.testResults;
    state.db.preferences = snapshot.preferences;
    render(false);
    toast(errorMsg, 'error');
  }
  resync();
}

function saveLog({ week, id, status, rpe = null, note = '' }) {
  const date = L.plannedDate(state.db, week, id);
  const variant = resolveVariant(state.db, week, id, state.variants);
  const body = { date, sessionId: id, variant, status };
  if (status === 'done' && rpe != null) body.rpe = rpe;
  if (note) body.note = note;
  return mutate(
    () => {
      state.db.logs = (state.db.logs || []).filter((l) => !(l.date === date && l.sessionId === id));
      state.db.logs.push({ id: tmpId(), ...body, note: note || '', createdAt: new Date().toISOString() });
    },
    () => store.saveLog(body),
    'Séance non enregistrée, réessaie',
  );
}

function deleteLog(logId) {
  return mutate(
    () => { state.db.logs = (state.db.logs || []).filter((l) => l.id !== logId); },
    () => (String(logId).startsWith('tmp-') ? Promise.resolve() : store.deleteLog(logId)),
    'Annulation impossible, réessaie',
  );
}

function saveTest(week, testId, value) {
  const body = { week, testId, value, date: L.todayISO() };
  return mutate(
    () => {
      state.db.testResults = (state.db.testResults || []).filter((r) => !(Number(r.week) === week && r.testId === testId));
      state.db.testResults.push({ id: tmpId(), ...body, createdAt: new Date().toISOString() });
    },
    () => store.saveTest(body),
    'Résultat non enregistré, réessaie',
  );
}

function deleteTest(id) {
  return mutate(
    () => { state.db.testResults = (state.db.testResults || []).filter((r) => r.id !== id); },
    () => (String(id).startsWith('tmp-') ? Promise.resolve() : store.deleteTest(id)),
    'Suppression impossible, réessaie',
  );
}

// Remplacement d'exercice dans une séance (mise à jour optimiste).
function saveSwap(sessionId, exerciseId, replacementId) {
  return mutate(
    () => {
      const prefs = (state.db.preferences ||= {});
      const swaps = (prefs.swaps ||= {});
      const key = L.swapKey(sessionId, exerciseId);
      if (replacementId) swaps[key] = replacementId;
      else delete swaps[key];
    },
    () => store.saveSwap({ sessionId, exerciseId, replacementId }),
    'Remplacement non enregistré, réessaie',
  );
}

async function setDb(db) {
  if (db && db.program) {
    state.db = db;
  } else {
    await load({ silent: true });
  }
}

// Routage

const ROUTES = [
  { re: /^\/?$/, tab: 'today', view: viewToday },
  { re: /^\/seances\/?$/, tab: 'seances', view: viewSessions },
  { re: /^\/seance\/(\d+)\/([^/]+)\/?$/, tab: 'seances', view: viewSession },
  { re: /^\/exercices\/?$/, tab: 'exercices', view: viewLibrary },
  { re: /^\/exercice\/([^/]+)\/?$/, tab: null, fallbackTab: 'exercices', view: viewExercise },
  { re: /^\/suivi\/?$/, tab: 'suivi', view: viewProgress },
  { re: /^\/config\/?$/, tab: null, fallbackTab: 'today', view: viewConfig },
];

const isConfigPath = (p) => /^\/config(\/|$)/.test(p || '');

function currentRoute() {
  const path = decodeURIComponent(location.hash.replace(/^#/, '') || '/');
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) return { ...r, params: m.slice(1), path };
  }
  return { ...ROUTES[0], params: [], path: '/' };
}

// tab null : l'onglet d'où l'on vient reste actif (fiche exercice, configuration).
function setTab(tab, fallback) {
  if (tab) state.lastTab = tab;
  else tab = state.lastTab || fallback;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('is-on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
}

function skeleton() {
  return `
    <div class="skel">
      <div class="sk sk-line w40"></div>
      <div class="sk sk-title"></div>
      <div class="sk sk-card"></div>
      <div class="sk sk-card short"></div>
    </div>`;
}

function errorScreen() {
  return `
    <section class="empty glass">
      <span class="empty-ico">${icon('alert')}</span>
      <p class="eyebrow">Données</p>
      <h2>Impossible de charger le programme.</h2>
      <p class="muted">Au tout premier lancement, l'app a besoin du réseau une fois pour récupérer le programme.</p>
      <button class="btn btn-primary" data-action="retry">Réessayer</button>
    </section>`;
}

function render(fresh = true) {
  const route = currentRoute();
  state.lastPath = route.path;
  setTab(route.tab, route.fallbackTab);
  if (state.cleanup) { try { state.cleanup(); } catch { /* rien */ } state.cleanup = null; }

  let out;
  if (state.loading && !state.db) out = { html: skeleton() };
  else if (!state.db) out = { html: errorScreen() };
  else {
    try {
      out = route.view(ctx(), route.params);
    } catch (err) {
      console.error(err);
      out = { html: errorScreen() };
    }
  }

  const y = window.scrollY;
  view.innerHTML = out.html;
  if (fresh) {
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    window.scrollTo({ top: y, behavior: 'instant' });
  }
  const c = out.mount?.(view, { fresh });
  if (typeof c === 'function') state.cleanup = c;
}

const ctx = () => ({ db: state.db, today: L.todayISO(), variants: state.variants, rerender: () => render(false), setDb, reload: resync, meta: store.meta() });

window.addEventListener('hashchange', () => {
  // Retour navigateur depuis une configuration modifiée : on reste et on demande.
  if (isConfigPath(state.lastPath) && !isConfigPath(currentRoute().path) && configDirty()) {
    const target = location.hash || '#/';
    history.replaceState(null, '', '#/config');
    openLeaveGuard(ctx(), () => { location.hash = target; });
    return;
  }
  state.navCount++;
  closeSheet(true);
  render(true);
});

// Liens internes depuis la configuration modifiée : confirmation dans une feuille.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || !isConfigPath(state.lastPath) || !configDirty()) return;
  const target = a.getAttribute('href');
  if (isConfigPath(target.replace(/^#/, ''))) return;
  e.preventDefault();
  e.stopPropagation();
  openLeaveGuard(ctx(), () => { location.hash = target; });
}, true);

window.addEventListener('beforeunload', (e) => {
  if (configDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// Feuilles

const RPE_HINTS = {
  1: 'Très facile', 2: 'Très facile', 3: 'Facile', 4: 'Facile', 5: 'Modéré', 6: 'Modéré, 4 reps en réserve',
  7: 'Dur, 3 reps en réserve', 8: 'Très dur, 2 reps en réserve', 9: 'Presque max, 1 rep en réserve', 10: 'Maximal, échec',
};

function openDoneSheet(week, id) {
  const s = L.sessionById(state.db, id);
  let rpe = null;
  openSheet({
    title: 'Séance terminée',
    subtitle: `${s?.name || id} · S${week}`,
    body: `
      <div class="field">
        <div class="field-head"><span class="label">Effort ressenti (RPE)</span><span class="rpe-hint" id="rpe-hint">Choisis une note</span></div>
        <div class="rpe-grid" role="radiogroup" aria-label="RPE de 1 à 10">
          ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<button type="button" class="rpe" role="radio" aria-checked="false" data-rpe="${n}" style="--i:${n}">${n}</button>`).join('')}
        </div>
      </div>
      <label class="field">
        <span class="label">Note <span class="muted">(facultatif)</span></span>
        <textarea id="done-note" rows="2" maxlength="500" placeholder="Charges, sensations, douleur..."></textarea>
      </label>
      <button class="btn btn-primary btn-block btn-lg" id="done-save">${icon('check')}Valider</button>`,
    onMount(sheet) {
      const hint = sheet.querySelector('#rpe-hint');
      sheet.querySelector('.rpe-grid').addEventListener('click', (e) => {
        const b = e.target.closest('.rpe');
        if (!b) return;
        rpe = Number(b.dataset.rpe);
        sheet.querySelectorAll('.rpe').forEach((x) => {
          const on = x === b;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-checked', String(on));
        });
        hint.textContent = `${rpe} : ${RPE_HINTS[rpe]}`;
        hint.classList.add('is-set');
      });
      sheet.querySelector('#done-save').addEventListener('click', () => {
        const note = sheet.querySelector('#done-note').value.trim();
        closeSheet();
        saveLog({ week, id, status: 'done', rpe, note });
        toast(rpe ? `Bien joué. RPE ${rpe} noté.` : 'Bien joué, séance notée.');
      });
    },
  });
}

function parseTestValue(raw, unit) {
  const s = String(raw).trim().replace(',', '.');
  if (!s) return null;
  if (unit === 's' && /^\d+:\d{1,2}$/.test(s)) {
    const [m, sec] = s.split(':').map(Number);
    return m * 60 + sec;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function openTestSheet(testId, week) {
  const t = (state.db.tests || []).find((x) => x.id === testId);
  if (!t) return;
  const r = L.testResult(state.db, week, testId);
  const isTime = t.unit === 's';
  const current = r ? (isTime && r.value >= 60 ? formatValue(r.value, 's') : String(r.value)) : '';
  const ex = t.exerciseId ? L.exerciseById(state.db, t.exerciseId) : null;
  openSheet({
    title: t.name,
    subtitle: `Semaine ${week} · ${t.better === 'lower' ? 'plus bas = mieux' : 'plus haut = mieux'}`,
    body: `
      <label class="field">
        <span class="label">Résultat</span>
        <div class="num-input">
          <input id="test-val" inputmode="${isTime ? 'text' : 'decimal'}" autocomplete="off" value="${esc(current)}" placeholder="${isTime ? 'ex. 95 ou 7:45' : '0'}">
          <span class="num-unit">${esc(unitLabel(t.unit))}</span>
        </div>
        ${isTime ? '<span class="muted small">En secondes, ou au format min:s</span>' : ''}
      </label>
      <button class="btn btn-primary btn-block btn-lg" id="test-save">Enregistrer</button>
      ${ex ? `<a class="btn btn-ghost btn-block" href="#/exercice/${esc(ex.id)}">Voir l'exercice</a>` : ''}
      ${r ? `<button class="btn btn-danger btn-block" id="test-del">${icon('trash')}Supprimer</button>` : ''}`,
    onMount(sheet) {
      const input = sheet.querySelector('#test-val');
      setTimeout(() => input.focus(), 250);
      const save = () => {
        const v = parseTestValue(input.value, t.unit);
        if (v == null) { input.classList.add('is-bad'); toast('Valeur invalide'); return; }
        closeSheet();
        saveTest(week, testId, v);
      };
      sheet.querySelector('#test-save').addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      sheet.querySelector('#test-del')?.addEventListener('click', () => { closeSheet(); deleteTest(r.id); });
    },
  });
}

function openSwapSheet(sessionId, originId) {
  const db = state.db;
  const origin = L.exerciseById(db, originId);
  if (!origin) return;
  const current = L.effectiveExerciseId(db, sessionId, originId);
  const options = [origin, ...L.alternativesOf(db, originId)];
  const s = L.sessionById(db, sessionId);
  openSheet({
    title: 'Changer d\'exercice',
    subtitle: `${s?.name || `Séance ${sessionId}`} · ${L.groupName(db, origin.group) || 'même groupe'}`,
    body: `
      <div class="pick-list">
        ${options.map((ex) => `
          <button type="button" class="pick-row ${ex.id === current ? 'is-on' : ''}" data-id="${esc(ex.id)}" aria-pressed="${ex.id === current}">
            ${thumb(ex)}
            <span class="ex-body">
              <span class="ex-name">${esc(ex.name)}</span>
              <span class="ex-note">${ex.id === origin.id ? 'Exercice prévu' : esc(ex.equipment || 'Alternative')}</span>
            </span>
            <span class="pick-check">${ex.id === current ? icon('check') : ''}</span>
          </button>`).join('')}
      </div>
      <p class="muted small">La prescription reste celle de l'exercice prévu, pour toutes les phases de cette séance.</p>`,
    onMount(sheet) {
      sheet.querySelector('.pick-list').addEventListener('click', (e) => {
        const b = e.target.closest('.pick-row');
        if (!b) return;
        const id = b.dataset.id;
        closeSheet();
        if (id === current) return;
        saveSwap(sessionId, originId, id === originId ? null : id);
        toast(id === originId ? 'Exercice prévu rétabli' : `${L.exerciseById(db, id)?.name || 'Alternative'} pour cette séance`);
      });
    },
  });
}

function goBack(fallback) {
  if (state.navCount > 0 && history.length > 1) history.back();
  else location.hash = fallback || '#/seances';
}

// Actions (délégation)

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'back') {
    const fb = el.dataset.fallback;
    if (isConfigPath(state.lastPath) && configDirty()) openLeaveGuard(ctx(), () => goBack(fb));
    else goBack(fb);
  } else if (a === 'swap') {
    openSwapSheet(el.dataset.session, el.dataset.ex);
  } else if (a === 'variant') {
    state.variants[el.dataset.key] = el.dataset.v;
    render(false);
  } else if (a === 'open-done') {
    openDoneSheet(Number(el.dataset.week), el.dataset.id);
  } else if (a === 'skip') {
    saveLog({ week: Number(el.dataset.week), id: el.dataset.id, status: 'skipped' });
    toast('Séance sautée. On reprend au planning.');
  } else if (a === 'undo') {
    deleteLog(el.dataset.log);
  } else if (a === 'test') {
    openTestSheet(el.dataset.test, Number(el.dataset.week));
  } else if (a === 'backup-reminder') {
    setConfigSection('donnees');
  } else if (a === 'calendar') {
    e.preventDefault();
    try { downloadCalendar(state.db); } catch { toast('Calendrier impossible à générer', 'error'); }
  } else if (a === 'retry') {
    state.loading = true;
    render(false);
    load().then(() => render(false));
  }
});

// Retour au premier plan : nouveau rendu (changement de jour).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.db) resync();
});

window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  toast('Une erreur est survenue');
});

render(true);
load().then(() => {
  render(true);
  if (state.db) store.requestPersist();
});
initServiceWorker();
