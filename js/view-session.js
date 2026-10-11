import * as L from './logic.js';
import { esc, icon, statusChip, thumb } from './ui.js';

export function resolveVariant(db, week, id, variants) {
  const key = `${week}/${id}`;
  const home = L.homeSessionOf(db, id);
  const log = L.findLog(db, L.plannedDate(db, week, id), id);
  let v = variants[key] || log?.variant || 'gym';
  if (v === 'home' && !home) v = 'gym';
  return v;
}

// Pastilles à cocher (V4). pos = "<bloc>/<item>" ou "<bloc>/r" (tours du bloc).
function marksHtml(db, pkey, pos, n, { label, unit = 'Série', single = false }) {
  const marks = L.progressMarks(db, pkey, pos, n);
  const btns = marks.map((on, i) => {
    const aria = single ? `${label} : fait` : `${unit} ${i + 1} sur ${n}, ${label}`;
    return `<button type="button" class="set ${single ? 'set-single' : ''} ${on ? 'is-on' : ''}" data-action="set" data-pkey="${esc(pkey)}" data-pos="${esc(pos)}" data-i="${i}" data-label="${esc(single ? label : `${label}, ${unit.toLowerCase()} ${i + 1}/${n}`)}" aria-pressed="${on}" aria-label="${esc(aria)}">
      <span class="set-dot">${single ? `${icon('check')}<span class="set-word">Fait</span>` : `<span class="set-n">${i + 1}</span>`}</span>
    </button>`;
  }).join('');
  return `<div class="sets" role="group" aria-label="${esc(single ? label : `${unit}s : ${label}`)}">${btns}</div>`;
}

function blockHtml(db, sessionId, b, pkey) {
  const rounds = b.roundsCount;
  return `
    <section class="block">
      <div class="block-head">
        <h3>${esc(b.title || '')}</h3>
        ${rounds ? `<span class="rounds">${icon('repeat')}${rounds} tours</span>` : ''}
      </div>
      ${b.note ? `<p class="block-note">${esc(b.note)}</p>` : ''}
      ${rounds ? `<div class="rounds-track glass"><span class="rounds-label">Tours</span>${marksHtml(db, pkey, `${b.index}/r`, Math.min(rounds, 12), { label: b.title || 'Circuit', unit: 'Tour' })}</div>` : ''}
      <div class="ex-list glass">
        ${b.items.map((it) => {
          const origin = L.exerciseById(db, it.exerciseId);
          const swapId = L.swapFor(db, sessionId, it.exerciseId);
          const ex = swapId ? L.exerciseById(db, swapId) : origin;
          const name = ex?.name || it.exerciseId || 'Exercice';
          const canSwap = origin && L.alternativesOf(db, origin.id).length > 0;
          const inner = `
            ${thumb(ex)}
            <span class="ex-body">
              <span class="ex-name">${esc(name)}</span>
              ${it.rx ? `<span class="ex-rx">${esc(it.rx)}</span>` : ''}
              ${it.note ? `<span class="ex-note">${esc(it.note)}</span>` : ''}
              ${swapId ? `<span class="ex-swapped">${icon('swap')}remplace : ${esc(origin?.name || it.exerciseId)}</span>` : ''}
            </span>`;
          const main = ex
            ? `<a class="ex-link" href="#/exercice/${esc(ex.id)}">${inner}${canSwap ? '' : icon('chevron', 'ex-chev')}</a>`
            : `<div class="ex-link">${inner}</div>`;
          const btn = canSwap
            ? `<button class="swap-btn ${swapId ? 'is-on' : ''}" type="button" data-action="swap" data-session="${esc(sessionId)}" data-ex="${esc(origin.id)}" aria-label="Changer d'exercice : ${esc(name)}">${icon('swap')}</button>`
            : '';
          const sets = rounds ? '' : (() => {
            const n = L.setCount(it.rx);
            return marksHtml(db, pkey, `${b.index}/${it.index}`, n, { label: name, single: n === 1 });
          })();
          return `<div class="ex-item"><div class="ex-row ${canSwap ? 'has-swap' : ''}">${main}${btn}</div>${sets}</div>`;
        }).join('')}
      </div>
    </section>`;
}

export function viewSession({ db, today, variants }, params) {
  const week = Number(params[0]);
  const id = params[1];
  const base = L.sessionById(db, id);
  const n = L.weekCount(db);
  if (!base || !Number.isInteger(week) || week < 1 || week > n || !(id in (db.program.schedule || {}))) {
    return {
      html: `
        <div class="topbar"><button class="icon-btn glass" data-action="back" aria-label="Retour">${icon('back')}</button></div>
        <section class="empty glass"><p class="eyebrow">Introuvable</p><h2>Cette séance n'existe pas.</h2><a class="btn btn-ghost" href="#/seances">Voir les séances</a></section>`,
    };
  }

  const entry = L.entryFor(db, week, id, today);
  const phase = L.phaseOf(db, week);
  const phaseId = phase?.id || 'p1';
  const home = L.homeSessionOf(db, id);
  const variant = resolveVariant(db, week, id, variants);
  const session = variant === 'home' && home ? home : base;
  const blocks = L.visibleBlocks(session, phaseId);
  const pkey = L.progressKey(week, id, variant);
  const rest = L.restFor(db, phaseId);
  const progress = blocks.length ? `
    <section class="prog glass" id="sess-progress" aria-label="Progression de la séance">
      <div class="prog-head">
        <span class="prog-count" aria-live="polite"><strong class="prog-done">0</strong> / <span class="prog-total">0</span> séries</span>
        <span class="prog-state">Coche au fil de l'eau</span>
      </div>
      <div class="prog-bar" aria-hidden="true"><span class="prog-fill"></span></div>
      <div class="prog-foot">
        <span class="prog-rest">${icon('clock')}${L.autoRestOn(db) ? `Repos auto ${esc(L.formatRest(rest))}` : 'Repos auto désactivé'}</span>
        <button type="button" class="prog-reset" data-action="reset-sets" data-pkey="${esc(pkey)}" hidden>Réinitialiser les cases</button>
      </div>
    </section>` : '';

  const seg = home ? `
    <div class="segmented glass" role="tablist" aria-label="Lieu">
      <span class="seg-thumb" style="transform: translateX(${variant === 'home' ? '100%' : '0'})"></span>
      <button role="tab" aria-selected="${variant === 'gym'}" class="${variant === 'gym' ? 'is-on' : ''}" data-action="variant" data-key="${week}/${esc(id)}" data-v="gym">${icon('gym')}Salle</button>
      <button role="tab" aria-selected="${variant === 'home'}" class="${variant === 'home' ? 'is-on' : ''}" data-action="variant" data-key="${week}/${esc(id)}" data-v="home">${icon('home')}Maison</button>
    </div>` : '';

  const log = entry.log;
  let actions;
  if (log) {
    const isDone = log.status === 'done';
    const bits = [];
    if (isDone && log.rpe != null && log.rpe !== '') bits.push(`RPE ${esc(log.rpe)}`);
    bits.push(log.variant === 'home' ? 'Maison' : 'Salle');
    actions = `
      <section class="logged glass ${isDone ? 'is-done' : 'is-skipped'}">
        <span class="logged-ico">${icon(isDone ? 'check' : 'skip')}</span>
        <div class="logged-body">
          <strong>${isDone ? 'Séance faite' : 'Séance sautée'}</strong>
          <span class="muted small">${bits.join(' · ')}</span>
          ${log.note ? `<p class="logged-note">${esc(log.note)}</p>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" data-action="undo" data-log="${esc(log.id)}">${icon('undo')}Annuler</button>
      </section>`;
  } else {
    actions = `
      <div class="actions">
        <button class="btn btn-primary btn-block btn-lg done-btn" data-action="open-done" data-week="${week}" data-id="${esc(id)}">${icon('check')}Marquer comme faite</button>
        <button class="btn btn-ghost btn-block" data-action="skip" data-week="${week}" data-id="${esc(id)}">Sauter cette séance</button>
      </div>`;
  }

  return {
    html: `
      <div class="topbar">
        <button class="icon-btn glass" data-action="back" aria-label="Retour">${icon('back')}</button>
        ${statusChip(entry.status)}
      </div>
      <header class="page-head">
        <p class="eyebrow">S${week} · ${esc(phase?.name || '')}${L.isTestWeek(db, week) ? ' · Tests' : ''}</p>
        <h1 class="page-title">${esc(base.name)}</h1>
        <p class="meta-line">
          <span>${esc(L.formatLong(entry.date))}</span>
          ${session.duration ? `<span class="sep"></span><span>${icon('clock')}${esc(session.duration)}</span>` : ''}
        </p>
      </header>
      ${seg}
      ${progress}
      ${session.intro ? `<p class="intro">${esc(session.intro)}</p>` : ''}
      <div class="blocks">${blocks.map((b) => blockHtml(db, session.id, b, pkey)).join('') || '<p class="muted">Rien de prévu pour cette phase.</p>'}</div>
      ${actions}`,
    mount(root) {
      syncProgressUi(root);
    },
    restSeconds: rest,
  };
}

// Compteur, jauge, bouton de fin mis en avant : calculés depuis les pastilles affichées.
export function syncProgressUi(root) {
  const card = root.querySelector('#sess-progress');
  if (!card) return;
  const all = root.querySelectorAll('.set');
  const done = root.querySelectorAll('.set.is-on').length;
  const total = all.length;
  const complete = total > 0 && done === total;
  card.querySelector('.prog-done').textContent = String(done);
  card.querySelector('.prog-total').textContent = String(total);
  card.querySelector('.prog-fill').style.transform = `scaleX(${total ? done / total : 0})`;
  card.querySelector('.prog-state').textContent = complete ? 'Tout est fait' : done ? `${total - done} restante${total - done > 1 ? 's' : ''}` : 'Coche au fil de l\'eau';
  card.classList.toggle('is-complete', complete);
  card.querySelector('.prog-reset').hidden = done === 0;
  root.querySelector('.done-btn')?.classList.toggle('is-ready', complete);
}
