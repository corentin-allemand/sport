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

function blockHtml(db, sessionId, b) {
  const rounds = b.roundsCount;
  return `
    <section class="block">
      <div class="block-head">
        <h3>${esc(b.title || '')}</h3>
        ${rounds ? `<span class="rounds">${icon('repeat')}${rounds} tours</span>` : ''}
      </div>
      ${b.note ? `<p class="block-note">${esc(b.note)}</p>` : ''}
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
          return `<div class="ex-row ${canSwap ? 'has-swap' : ''}">${main}${btn}</div>`;
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
        <button class="btn btn-primary btn-block btn-lg" data-action="open-done" data-week="${week}" data-id="${esc(id)}">${icon('check')}Marquer comme faite</button>
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
      ${session.intro ? `<p class="intro">${esc(session.intro)}</p>` : ''}
      <div class="blocks">${blocks.map((b) => blockHtml(db, session.id, b)).join('') || '<p class="muted">Rien de prévu pour cette phase.</p>'}</div>
      ${actions}`,
  };
}
