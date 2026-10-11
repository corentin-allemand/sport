import * as L from './logic.js';
import { esc, icon, statusChip, STATUS } from './ui.js';

export function viewSessions({ db, today }) {
  const n = L.weekCount(db);
  const ws = L.weekState(db, today);
  const current = ws.week;

  const weeks = [];
  for (let w = 1; w <= n; w++) {
    const entries = L.weekEntries(db, w, today);
    const phase = L.phaseOf(db, w);
    const { start, end } = L.weekRange(db, w);
    const isCurrent = w === current && !ws.after;
    const done = entries.filter((e) => e.status === 'done').length;
    const prevPhase = w > 1 ? L.phaseOf(db, w - 1) : null;
    const phaseHead = phase && (!prevPhase || prevPhase.id !== phase.id)
      ? `<div class="phase-head"><span class="eyebrow">Phase ${esc(phase.id.replace('p', ''))}</span><h2>${esc(phase.name)}</h2>${phase.description ? `<p class="muted small">${esc(phase.description)}</p>` : ''}</div>`
      : '';

    weeks.push(`
      ${phaseHead}
      <details class="week glass ${isCurrent ? 'is-current' : ''}" id="week-${w}" ${isCurrent ? 'open' : ''}>
        <summary class="week-sum">
          <span class="week-badge">S${w}</span>
          <span class="week-info">
            <span class="week-title">${isCurrent ? 'Cette semaine' : `Semaine ${w}`}${L.isTestWeek(db, w) ? '<span class="tag">Tests</span>' : ''}</span>
            <span class="week-dates">${esc(L.formatDay(start))} au ${esc(L.formatDay(end))}</span>
          </span>
          <span class="mini-dots" aria-label="${done} séances faites sur ${entries.length}">
            ${entries.map((e) => `<span class="mdot ${STATUS[e.status].cls}"></span>`).join('')}
          </span>
          ${icon('down', 'week-caret')}
        </summary>
        <div class="week-body">
          ${entries.map((e) => `
            <a class="sess-row" href="#/seance/${w}/${esc(e.id)}">
              <span class="sess-letter ${STATUS[e.status].cls}">${esc(e.id)}</span>
              <span class="sess-info">
                <span class="sess-name">${esc(e.session?.name || `Séance ${e.id}`)}</span>
                <span class="sess-date">${esc(L.formatShort(e.date))}${e.log?.variant === 'home' ? ' · Maison' : ''}</span>
              </span>
              ${statusChip(e.status)}
            </a>`).join('')}
        </div>
      </details>`);
  }

  return {
    html: `
      <header class="page-head">
        <p class="eyebrow">${esc(db.program.name || 'Programme')}</p>
        <h1 class="page-title">Séances</h1>
        <p class="lead">${n} semaines, ${L.sortedSchedule(db).length} séances par semaine.</p>
      </header>
      <div class="weeks">${weeks.join('')}</div>`,
    mount(root, { fresh }) {
      if (!fresh) return;
      const el = root.querySelector('.week.is-current');
      if (el && current > 1) {
        requestAnimationFrame(() => {
          const y = el.getBoundingClientRect().top + window.scrollY - 40;
          window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        });
      }
    },
  };
}
