import * as L from './logic.js';
import { esc, icon, statusChip, STATUS } from './ui.js';

function heroCard(db, hero, today, opts = {}) {
  if (!hero) {
    return `
      <section class="hero glass hero-end">
        <p class="eyebrow accent">Programme terminé</p>
        <h2 class="hero-title">${L.weekCount(db)} semaines bouclées.</h2>
        <p class="muted">Tes tests de fin et ton bilan t'attendent dans Suivi.</p>
        <a class="btn btn-primary btn-block" href="#/suivi">Voir mon bilan ${icon('arrow')}</a>
      </section>`;
  }
  const e = hero.entry;
  const s = e.session || {};
  const phase = L.phaseOf(db, e.week);
  let label;
  if (opts.first) label = 'Première séance';
  else if (hero.kind === 'today') label = "Aujourd'hui";
  else label = hero.inDays === 1 ? 'Demain' : `Dans ${hero.inDays} jours`;

  const showStatus = e.status === 'done' || e.status === 'skipped';
  const cta = e.status === 'done' ? 'Revoir la séance' : hero.kind === 'today' ? 'Commencer' : 'Voir la séance';

  return `
    <a class="hero glass ${e.status === 'today' ? 'is-today' : ''}" href="#/seance/${e.week}/${esc(e.id)}">
      <span class="hero-mark" aria-hidden="true">${esc(e.id)}</span>
      <div class="hero-top">
        <span class="eyebrow ${hero.kind === 'today' ? 'accent' : ''}">${esc(label)}</span>
        ${showStatus ? statusChip(e.status) : ''}
      </div>
      <h2 class="hero-title">${esc(s.name || `Séance ${e.id}`)}</h2>
      <p class="hero-meta">
        <span>${esc(L.formatLong(e.date))}</span>
        ${s.duration ? `<span class="sep"></span><span>${icon('clock')}${esc(s.duration)}</span>` : ''}
      </p>
      <p class="hero-phase">S${e.week} · ${esc(phase?.name || '')}</p>
      <span class="btn btn-primary btn-block">${cta} ${icon('arrow')}</span>
    </a>`;
}

function weekDots(db, entries) {
  return `
    <div class="week-dots">
      ${entries.map((e) => `
        <a class="wdot ${STATUS[e.status].cls}" href="#/seance/${e.week}/${esc(e.id)}" aria-label="Séance ${esc(e.id)}, ${esc(L.formatLong(e.date))}, ${STATUS[e.status].label}">
          <span class="wdot-ring">${e.status === 'done' ? icon('check') : esc(e.id)}</span>
          <span class="wdot-day">${esc(L.formatWeekday(e.date))}</span>
        </a>`).join('')}
    </div>`;
}

const BACKUP_EVERY_DAYS = 30;

// Rappel discret : aucun export depuis 30 jours (ou depuis le premier lancement).
function backupReminder(meta, today) {
  const ref = meta?.lastExportAt || meta?.firstRunAt;
  if (!ref) return '';
  const days = L.diffDays(ref.slice(0, 10), today);
  if (!(days >= BACKUP_EVERY_DAYS)) return '';
  return `
    <a class="row-link glass row-quiet" href="#/config" data-action="backup-reminder">
      <span class="row-ico">${icon('download')}</span>
      <span class="row-text"><strong>Pense à sauvegarder tes données</strong><span>${meta.lastExportAt ? `Dernier export il y a ${days} jours` : 'Aucun export pour l\'instant'}</span></span>
      ${icon('chevron', 'muted')}
    </a>`;
}

export function viewToday({ db, today, meta }) {
  const ws = L.weekState(db, today);
  const n = L.weekCount(db);
  const week = ws.week;
  const phase = L.phaseOf(db, week);
  const entries = L.weekEntries(db, week, today);
  const doneCount = entries.filter((e) => e.status === 'done').length;
  const missed = ws.after ? [] : entries.filter((e) => e.status === 'missed');
  const testWeek = !ws.after && L.isTestWeek(db, week);

  const settingsBtn = `<a class="icon-btn glass head-action" href="#/config" aria-label="Configuration">${icon('settings')}</a>`;
  let head;
  let hero;
  if (ws.before) {
    const first = L.allEntries(db, today)[0];
    head = `
      <header class="page-head has-action">
        ${settingsBtn}
        <p class="eyebrow">${esc(L.formatLong(today))}</p>
        <div class="countdown">
          <span class="big-num accent">J-${ws.daysToStart}</span>
          <span class="countdown-sub">avant le début<br>du programme</span>
        </div>
        <p class="lead">Semaine 1 / ${n} démarre ${esc(L.formatLong(db.program.startDate).toLowerCase())}. Phase ${esc(phase?.name || '')}.</p>
      </header>`;
    hero = heroCard(db, first ? { entry: first, kind: 'next', inDays: L.diffDays(today, first.date) } : null, today, { first: true });
  } else {
    head = `
      <header class="page-head has-action">
        ${settingsBtn}
        <p class="eyebrow">${esc(L.formatLong(today))}</p>
        <div class="week-display">
          <div class="week-num"><span class="big-num">S${week}</span><span class="week-of">/ ${n}</span></div>
          ${phase ? `<span class="phase-pill">${esc(phase.name)}</span>` : ''}
        </div>
      </header>`;
    hero = heroCard(db, L.heroEntry(db, today), today);
  }

  const testBanner = testWeek ? `
    <a class="banner glass" href="#/suivi">
      <span class="banner-ico">${icon('stopwatch')}</span>
      <span class="banner-text"><strong>Semaine de tests</strong><span>Note tes résultats S${week} dans Suivi</span></span>
      ${icon('chevron', 'muted')}
    </a>` : '';

  const missedCard = missed.length ? `
    <section class="card glass card-missed">
      <div class="card-head">
        <h3>${missed.length === 1 ? '1 séance manquée' : `${missed.length} séances manquées`}</h3>
        <span class="muted small">cette semaine</span>
      </div>
      <p class="muted small">On ne rattrape pas forcément. Si tu l'as faite un autre jour, marque-la.</p>
      <div class="pill-row">
        ${missed.map((e) => `<a class="pill-link" href="#/seance/${e.week}/${esc(e.id)}"><strong>${esc(e.id)}</strong> ${esc(L.formatWeekday(e.date))} ${icon('chevron')}</a>`).join('')}
      </div>
    </section>` : '';

  return {
    html: `
      ${head}
      ${testBanner}
      ${hero}
      <section class="card glass">
        <div class="card-head">
          <h3>${ws.before || ws.after ? `Semaine ${week}` : 'Cette semaine'}</h3>
          <span class="count"><strong>${doneCount}</strong> / ${entries.length}</span>
        </div>
        ${weekDots(db, entries)}
      </section>
      ${missedCard}
      ${backupReminder(meta, today)}
      <a class="row-link glass" href="#" data-action="calendar">
        <span class="row-ico">${icon('calendarPlus')}</span>
        <span class="row-text"><strong>Ajouter à mon calendrier</strong><span>Séances à 7 h, rappel 1 h avant</span></span>
        ${icon('chevron', 'muted')}
      </a>`,
  };
}
