// Minuteur de repos et chronomètre (V4).
// Le temps vient toujours d'horodatages (Date.now), jamais d'incréments : l'intervalle
// ne sert qu'à rafraîchir l'affichage. État persisté dans localStorage pour survivre
// à l'arrière-plan, au verrouillage et au rechargement.
import { esc, icon, openSheet, closeSheet } from './ui.js';

const LS_KEY = 'sport.timer.v1';
const PRESETS = [30, 45, 60, 90, 120, 180];
const STEP = 15000;
const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;
const MINI_R = 9;
const MINI_C = 2 * Math.PI * MINI_R;
const SOUND_GRACE = 3000; // fin détectée plus tard que ça : écran revenu, pas de son

const now = () => Date.now();

// ---------- état ----------

function blank() {
  return {
    mode: 'rest',
    suggested: 90, // durée proposée quand rien ne tourne (repos de la phase consultée)
    rest: { status: 'idle', endAt: 0, remaining: 0, duration: 0, label: '' },
    chrono: { status: 'idle', startAt: 0, acc: 0, laps: [] },
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return blank();
    const b = blank();
    return {
      mode: raw.mode === 'chrono' ? 'chrono' : 'rest',
      suggested: Number(raw.suggested) > 0 ? Number(raw.suggested) : b.suggested,
      rest: { ...b.rest, ...(raw.rest || {}) },
      chrono: { ...b.chrono, ...(raw.chrono || {}), laps: Array.isArray(raw.chrono?.laps) ? raw.chrono.laps.filter(Number.isFinite) : [] },
    };
  } catch {
    return blank();
  }
}

let st = load();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch { /* stockage indisponible : l'état reste en mémoire */ }
}

const restLeft = () => {
  const r = st.rest;
  if (r.status === 'running') return Math.max(0, r.endAt - now());
  if (r.status === 'paused') return r.remaining;
  return 0;
};
const chronoElapsed = () => {
  const c = st.chrono;
  return c.status === 'running' ? c.acc + (now() - c.startAt) : c.acc;
};
const restActive = () => st.rest.status !== 'idle';
const chronoActive = () => st.chrono.status !== 'idle';
const anyRunning = () => st.rest.status === 'running' || st.chrono.status === 'running';

// ---------- formats ----------

function fmtClock(ms, ceil = true) {
  const total = ceil ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtChrono(ms) {
  const tenth = Math.floor((ms % 1000) / 100);
  return `${fmtClock(ms, false)}<span class="tm-tenth">,${tenth}</span>`;
}
function fmtSpoken(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (!m) return `${s} secondes`;
  return s ? `${m} minute${m > 1 ? 's' : ''} ${s}` : `${m} minute${m > 1 ? 's' : ''}`;
}
const presetLabel = (s) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60}` : `${s / 60} min`);

// ---------- son, vibration (débloqués au premier geste, obligatoire sur iOS) ----------

let audio = null;

function unlockAudio() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    // Tampon silencieux : finit de déverrouiller la sortie audio sur Safari iOS.
    const buf = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(audio.destination);
    src.start(0);
  } catch { /* son indisponible */ }
}

function onFirstGesture() {
  unlockAudio();
  if (audio && audio.state === 'running') {
    for (const ev of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(ev, onFirstGesture, true);
  }
}

// Bip doux à deux tons.
function beep() {
  try {
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const t0 = audio.currentTime + 0.02;
    [[660, 0], [990, 0.2]].forEach(([freq, at]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.32);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.34);
    });
  } catch { /* son indisponible */ }
}

function vibrate() {
  try { if (typeof navigator.vibrate === 'function') navigator.vibrate([140, 90, 140]); } catch { /* absent sur iOS */ }
}

// ---------- écran allumé (Screen Wake Lock) ----------

let lock = null;
let lockPending = false;

async function syncWakeLock() {
  const want = anyRunning() && document.visibilityState === 'visible';
  try {
    if (want && !lock && !lockPending && navigator.wakeLock?.request) {
      lockPending = true;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener?.('release', () => { lock = null; });
      } finally {
        lockPending = false;
      }
      if (!anyRunning() && lock) { const l = lock; lock = null; await l.release(); }
    } else if (!want && lock && document.visibilityState === 'visible') {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch { /* non supporté ou refusé : ignoré */ }
}

// ---------- annonces (aria-live, aux paliers seulement) ----------

let lastMilestone = null;
function announce(text) {
  const el = document.getElementById('timer-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);
}
function checkMilestones() {
  if (st.rest.status !== 'running') return;
  const sec = Math.ceil(restLeft() / 1000);
  for (const m of [30, 10]) {
    if (sec === m && st.rest.duration > (m + 10) * 1000 && lastMilestone !== m) {
      lastMilestone = m;
      announce(`Repos : ${m} secondes`);
    }
  }
}

// ---------- actions ----------

let onChange = () => {};

function commit() {
  save();
  render();
  syncLoop();
  syncWakeLock();
  onChange();
}

export function startRest(seconds, label = '') {
  const ms = Math.max(1, Math.round(Number(seconds) || 0)) * 1000;
  st.rest = { status: 'running', endAt: now() + ms, remaining: 0, duration: ms, label };
  st.suggested = Math.round(ms / 1000);
  lastMilestone = null;
  unlockAudio();
  announce(`Repos lancé, ${fmtSpoken(Math.round(ms / 1000))}`);
  commit();
}

function adjustRest(delta) {
  const r = st.rest;
  if (r.status === 'running') {
    const left = Math.max(0, r.endAt - now() + delta);
    r.endAt = now() + left;
    r.duration = Math.max(r.duration + delta, left, 1000);
    if (left <= 0) { finishRest(true); return; }
  } else if (r.status === 'paused') {
    r.remaining = Math.max(0, r.remaining + delta);
    r.duration = Math.max(r.duration + delta, r.remaining, 1000);
    if (r.remaining <= 0) { finishRest(true); return; }
  } else return;
  lastMilestone = null;
  commit();
}

function pauseRest() {
  if (st.rest.status !== 'running') return;
  st.rest.remaining = Math.max(0, st.rest.endAt - now());
  st.rest.status = 'paused';
  announce('Repos en pause');
  commit();
}

function resumeRest() {
  if (st.rest.status !== 'paused') return;
  st.rest.endAt = now() + st.rest.remaining;
  st.rest.status = 'running';
  announce('Repos repris');
  commit();
}

function stopRest() {
  st.rest = { ...blank().rest };
  commit();
}

let flashUntil = 0;
function finishRest(withSound) {
  st.rest.status = 'done';
  st.rest.remaining = 0;
  if (withSound) { beep(); vibrate(); }
  flashUntil = now() + 2400;
  announce('Repos terminé, go');
  commit();
}

function chronoToggle() {
  const c = st.chrono;
  if (c.status === 'running') {
    c.acc += now() - c.startAt;
    c.status = 'paused';
    announce(`Chrono en pause, ${fmtSpoken(Math.floor(c.acc / 1000))}`);
  } else {
    c.startAt = now();
    c.status = 'running';
    unlockAudio();
    announce('Chrono lancé');
  }
  commit();
}

function chronoLap() {
  if (st.chrono.status !== 'running') return;
  st.chrono.laps.push(chronoElapsed());
  announce(`Tour ${st.chrono.laps.length}`);
  commit();
}

function chronoReset() {
  st.chrono = { ...blank().chrono, laps: [] };
  commit();
}

export function setSuggestedRest(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s > 0 && s !== st.suggested && !restActive()) { st.suggested = s; save(); render(); }
}

// ---------- boucle d'affichage ----------

let loop = null;
let sheetEl = null;

function tick() {
  if (st.rest.status === 'running' && now() >= st.rest.endAt) {
    const late = now() - st.rest.endAt;
    finishRest(document.visibilityState === 'visible' && late < SOUND_GRACE);
    return;
  }
  checkMilestones();
  render();
  syncLoop();
}

function syncLoop() {
  const need = anyRunning() || flashUntil > now();
  if (need && !loop) loop = setInterval(tick, 100);
  else if (!need && loop) { clearInterval(loop); loop = null; }
}

// ---------- pastille flottante ----------

let pill = null;
let routeWantsPill = false;

function pillHtml() {
  return `
    <button type="button" class="timer-pill glass-strong" id="timer-pill" aria-label="Minuteur" hidden>
      <span class="tp-ring" aria-hidden="true">
        <svg viewBox="0 0 24 24"><circle class="tp-track" cx="12" cy="12" r="${MINI_R}"/><circle class="tp-arc" cx="12" cy="12" r="${MINI_R}" stroke-dasharray="${MINI_C.toFixed(2)}" stroke-dashoffset="0"/></svg>
        ${icon('stopwatch', 'tp-ico')}
      </span>
      <span class="tp-text">Minuteur</span>
    </button>
    <span id="timer-live" class="sr-only" role="status" aria-live="polite"></span>`;
}

function renderPill() {
  if (!pill) return;
  const show = routeWantsPill || restActive() || chronoActive();
  pill.hidden = !show;
  document.body.classList.toggle('has-timer-pill', show);
  if (!show) return;
  const text = pill.querySelector('.tp-text');
  const arc = pill.querySelector('.tp-arc');
  let state = 'idle';
  let label = 'Minuteur';
  let frac = 0;
  if (st.rest.status === 'done') {
    state = 'go';
    label = 'Go';
  } else if (restActive()) {
    state = st.rest.status === 'paused' ? 'paused' : 'rest';
    label = fmtClock(restLeft());
    frac = st.rest.duration ? restLeft() / st.rest.duration : 0;
  } else if (chronoActive()) {
    state = st.chrono.status === 'paused' ? 'paused' : 'chrono';
    label = fmtClock(chronoElapsed(), false);
    frac = 1;
  }
  if (text.textContent !== label) text.textContent = label;
  pill.dataset.state = state;
  pill.classList.toggle('is-flash', flashUntil > now());
  arc.style.strokeDashoffset = String((MINI_C * (1 - frac)).toFixed(2));
  pill.setAttribute('aria-label', state === 'go' ? 'Repos terminé, ouvrir le minuteur'
    : state === 'idle' ? 'Ouvrir le minuteur' : `Minuteur, ${label}`);
}

export function setPillRoute(on) {
  routeWantsPill = !!on;
  renderPill();
}

// ---------- feuille ----------

function restPanel() {
  const r = st.rest;
  const active = restActive();
  const left = active ? restLeft() : st.suggested * 1000;
  const frac = r.status === 'done' ? 0 : active && r.duration ? left / r.duration : 1;
  const big = r.status === 'done' ? 'Go' : fmtClock(left);
  const sub = r.status === 'done' ? 'Repos terminé'
    : r.status === 'paused' ? 'En pause'
      : r.status === 'running' ? (r.label || 'Repos') : 'Prêt';
  const main = r.status === 'running'
    ? `<button type="button" class="tm-main" data-tm="pause" aria-label="Pause">${icon('pause')}</button>`
    : r.status === 'paused'
      ? `<button type="button" class="tm-main" data-tm="resume" aria-label="Reprendre">${icon('play')}</button>`
      : `<button type="button" class="tm-main" data-tm="start" aria-label="${r.status === 'done' ? 'Relancer' : 'Démarrer'} ${esc(presetLabel(st.suggested))}">${icon(r.status === 'done' ? 'repeat' : 'play')}</button>`;
  const canAdjust = r.status === 'running' || r.status === 'paused';
  return `
    <div class="tm-dial ${r.status === 'done' ? 'is-go' : ''}" data-state="${r.status}">
      <svg class="tm-ring" viewBox="0 0 240 240" aria-hidden="true">
        <circle class="tm-track" cx="120" cy="120" r="${RING_R}"/>
        <circle class="tm-arc" cx="120" cy="120" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${(RING_C * (1 - frac)).toFixed(2)}"/>
      </svg>
      <div class="tm-center">
        <span class="tm-big" id="tm-big">${big}</span>
        <span class="tm-sub">${esc(sub)}</span>
      </div>
    </div>
    <div class="tm-controls">
      <button type="button" class="tm-step" data-tm="minus" ${canAdjust ? '' : 'disabled'} aria-label="Retirer 15 secondes">-15 s</button>
      ${main}
      <button type="button" class="tm-step" data-tm="plus" ${canAdjust ? '' : 'disabled'} aria-label="Ajouter 15 secondes">+15 s</button>
    </div>
    <div class="tm-presets" role="group" aria-label="Durées de repos">
      ${PRESETS.map((s) => `<button type="button" class="tm-preset ${!active && st.suggested === s ? 'is-on' : ''}" data-tm="preset" data-s="${s}">${presetLabel(s)}</button>`).join('')}
    </div>
    ${active ? `<button type="button" class="btn btn-ghost btn-block" data-tm="stop">${icon(r.status === 'done' ? 'check' : 'x')}${r.status === 'done' ? 'Terminer' : 'Arrêter le repos'}</button>` : ''}`;
}

function chronoPanel() {
  const c = st.chrono;
  const laps = c.laps;
  const lapRows = laps.map((t, i) => ({ n: i + 1, split: t - (laps[i - 1] || 0), total: t })).reverse();
  return `
    <div class="tm-chrono">
      <span class="tm-big tm-big-chrono" id="tm-chrono">${fmtChrono(chronoElapsed())}</span>
      <span class="tm-sub">${c.status === 'running' ? 'En cours' : c.status === 'paused' ? 'En pause' : 'Exercice tenu, planche, suspension'}</span>
    </div>
    <div class="tm-controls">
      ${c.status === 'running'
        ? '<button type="button" class="tm-step tm-step-wide" data-tm="lap">Tour</button>'
        : `<button type="button" class="tm-step tm-step-wide" data-tm="reset" ${c.status === 'idle' ? 'disabled' : ''}>Remise à zéro</button>`}
      <button type="button" class="tm-main" data-tm="chrono" aria-label="${c.status === 'running' ? 'Pause' : 'Démarrer'}">${icon(c.status === 'running' ? 'pause' : 'play')}</button>
    </div>
    ${lapRows.length ? `
      <ol class="tm-laps" aria-label="Tours">
        ${lapRows.map((l) => `<li><span class="tm-lap-n">Tour ${l.n}</span><span class="tm-lap-split">${fmtClock(l.split, false)},${Math.floor((l.split % 1000) / 100)}</span><span class="tm-lap-total">${fmtClock(l.total, false)}</span></li>`).join('')}
      </ol>` : ''}`;
}

function sheetBody() {
  const isRest = st.mode === 'rest';
  return `
    <div class="segmented glass tm-seg" role="tablist" aria-label="Mode">
      <span class="seg-thumb" style="transform: translateX(${isRest ? '0' : '100%'})"></span>
      <button type="button" role="tab" aria-selected="${isRest}" class="${isRest ? 'is-on' : ''}" data-tm="mode" data-mode="rest">${icon('clock')}Repos</button>
      <button type="button" role="tab" aria-selected="${!isRest}" class="${!isRest ? 'is-on' : ''}" data-tm="mode" data-mode="chrono">${icon('stopwatch')}Chrono</button>
    </div>
    <div class="tm-panel" id="tm-panel">${isRest ? restPanel() : chronoPanel()}</div>`;
}

let panelSig = '';
function panelSignature() {
  return JSON.stringify([st.mode, st.rest.status, st.rest.label, st.suggested, st.chrono.status, st.chrono.laps.length, st.rest.duration]);
}

function renderSheet() {
  if (!sheetEl || !sheetEl.isConnected) { sheetEl = null; return; }
  const sig = panelSignature();
  if (sig !== panelSig) {
    panelSig = sig;
    const body = sheetEl.querySelector('.sheet-body');
    const seg = body.querySelector('.tm-seg');
    const isRest = st.mode === 'rest';
    seg.querySelector('.seg-thumb').style.transform = `translateX(${isRest ? '0' : '100%'})`;
    seg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.mode === st.mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    body.querySelector('#tm-panel').innerHTML = isRest ? restPanel() : chronoPanel();
    return;
  }
  // Mise à jour légère : chiffres et anneau.
  if (st.mode === 'rest') {
    const big = sheetEl.querySelector('#tm-big');
    const arc = sheetEl.querySelector('.tm-arc');
    if (big && restActive() && st.rest.status !== 'done') {
      const left = restLeft();
      const t = fmtClock(left);
      if (big.textContent !== t) big.textContent = t;
      if (arc && st.rest.duration) arc.style.strokeDashoffset = String((RING_C * (1 - left / st.rest.duration)).toFixed(2));
    }
  } else {
    const el = sheetEl.querySelector('#tm-chrono');
    if (el) el.innerHTML = fmtChrono(chronoElapsed());
  }
}

function render() {
  renderPill();
  renderSheet();
}

export function openTimerSheet() {
  // Ouvre sur ce qui tourne : repos en cours ou fini en priorité, sinon le chrono.
  if (restActive()) st.mode = 'rest';
  else if (chronoActive()) st.mode = 'chrono';
  save();
  panelSig = '';
  openSheet({
    title: 'Minuteur',
    subtitle: 'Repos entre les séries, chrono pour les exercices tenus',
    body: sheetBody(),
    onMount(sheet) {
      sheet.classList.add('sheet-full', 'sheet-timer');
      sheetEl = sheet;
      panelSig = panelSignature();
      sheet.addEventListener('click', (e) => {
        const b = e.target.closest('[data-tm]');
        if (!b || b.disabled) return;
        const a = b.dataset.tm;
        if (a === 'mode') { st.mode = b.dataset.mode; commit(); }
        else if (a === 'preset') startRest(Number(b.dataset.s));
        else if (a === 'start') startRest(st.suggested);
        else if (a === 'pause') pauseRest();
        else if (a === 'resume') resumeRest();
        else if (a === 'plus') adjustRest(STEP);
        else if (a === 'minus') adjustRest(-STEP);
        else if (a === 'stop') stopRest();
        else if (a === 'chrono') chronoToggle();
        else if (a === 'lap') chronoLap();
        else if (a === 'reset') chronoReset();
      });
      syncLoop();
    },
  });
}

// ---------- installation ----------

export function initTimer({ onStateChange } = {}) {
  if (typeof onStateChange === 'function') onChange = onStateChange;
  const wrap = document.createElement('div');
  wrap.className = 'timer-dock';
  wrap.innerHTML = pillHtml();
  document.body.appendChild(wrap);
  pill = wrap.querySelector('#timer-pill');
  pill.addEventListener('click', () => openTimerSheet());

  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, onFirstGesture, true);

  // Retour au premier plan : temps recalculé depuis les horodatages, verrou d'écran redemandé.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { st = load(); tick(); }
    syncWakeLock();
  });
  // Autre onglet : même état.
  window.addEventListener('storage', (e) => { if (e.key === LS_KEY) { st = load(); render(); syncLoop(); } });

  // Rechargement : un repos fini entre-temps affiche « Go », sans son.
  if (st.rest.status === 'running' && now() >= st.rest.endAt) {
    st.rest.status = 'done';
    st.rest.remaining = 0;
    save();
  }
  render();
  syncLoop();
  syncWakeLock();
}

export const timerState = () => structuredClone(st);
