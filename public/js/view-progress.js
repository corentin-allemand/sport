import * as L from './logic.js';
import { esc, icon } from './ui.js';

export function formatValue(v, unit) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (unit === 's' && n >= 60) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return L.formatNumber(n, Number.isInteger(n) ? 0 : 1);
}

export const unitLabel = (u) => ({ s: 's', kg: 'kg', reps: 'reps' }[u] ?? u ?? '');

function deltaHtml(test, value, base) {
  if (value == null || base == null) return '';
  const d = Number(value) - Number(base);
  if (!d) return '<span class="delta">=</span>';
  const good = test.better === 'lower' ? d < 0 : d > 0;
  const abs = Math.abs(d);
  const txt = test.unit === 's' && abs >= 60 ? formatValue(abs, 's') : `${L.formatNumber(abs, Number.isInteger(abs) ? 0 : 1)}`;
  return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '+' : '-'}${txt}</span>`;
}

function chart(perWeek, currentWeek, started) {
  const W = 340, H = 132, top = 8, bottom = 24;
  const n = perWeek.length;
  const gap = 6;
  const bw = (W - gap * (n - 1)) / n;
  const maxV = Math.max(3, ...perWeek.map((p) => p.total));
  const ih = H - top - bottom;
  const bars = perWeek.map((p, i) => {
    const x = i * (bw + gap);
    const h = p.done ? Math.max(6, (p.done / maxV) * ih) : 0;
    const isCur = started && p.week === currentWeek;
    const future = !started || p.week > currentWeek;
    return `
      <g class="${isCur ? 'cur' : ''} ${future ? 'future' : ''}">
        <rect class="track" x="${x}" y="${top}" width="${bw}" height="${ih}" rx="${Math.min(8, bw / 2)}"/>
        ${h ? `<rect class="bar" x="${x}" y="${top + ih - h}" width="${bw}" height="${h}" rx="${Math.min(8, bw / 2)}"/>` : ''}
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${p.week}</text>
      </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Séances faites par semaine">${bars}</svg>`;
}

function collapsible(title, items, render) {
  if (!items?.length) return '';
  return `
    <details class="fold glass">
      <summary><span>${esc(title)}</span>${icon('down', 'fold-caret')}</summary>
      <div class="fold-body">${items.map(render).join('')}</div>
    </details>`;
}

export function viewProgress({ db, today }) {
  const st = L.stats(db, today);
  const ws = L.weekState(db, today);
  const testWeeks = db.program.testWeeks || [];
  const tests = db.tests || [];

  const pct = st.pct == null ? '0' : String(st.pct);

  const testRows = tests.map((t) => {
    const base = L.testResult(db, testWeeks[0], t.id);
    return `
      <div class="t-row">
        <div class="t-name"><span>${esc(t.name)}</span><span class="t-unit">${esc(unitLabel(t.unit))} · ${t.better === 'lower' ? '↓' : '↑'} mieux</span></div>
        ${testWeeks.map((w, i) => {
          const r = L.testResult(db, w, t.id);
          return `
            <button class="t-cell ${r ? 'has' : ''}" data-action="test" data-test="${esc(t.id)}" data-week="${w}" aria-label="${esc(t.name)}, S${w}${r ? `, ${esc(formatValue(r.value, t.unit))}` : ''}">
              ${r ? `<span class="t-val">${esc(formatValue(r.value, t.unit))}</span>${i > 0 ? deltaHtml(t, r.value, base?.value) : ''}` : '<span class="t-plus">+</span>'}
            </button>`;
        }).join('')}
      </div>`;
  }).join('');

  return {
    html: `
      <header class="page-head has-action">
        <a class="icon-btn glass head-action" href="#/config" aria-label="Configuration">${icon('settings')}</a>
        <p class="eyebrow">${ws.before ? 'Avant le départ' : `Semaine ${ws.week} / ${L.weekCount(db)}`}</p>
        <h1 class="page-title">Suivi</h1>
      </header>

      <section class="metric-hero glass">
        <span class="eyebrow">Séances faites</span>
        <div class="metric-big"><span class="big-num">${pct}</span><span class="metric-unit">%</span></div>
        <div class="meter"><span style="width:${st.pct || 0}%"></span></div>
        <p class="muted small">${st.total ? `${st.done} sur ${st.total} séances prévues à ce jour` : 'Les compteurs démarrent avec la première séance.'}</p>
      </section>

      <div class="metric-grid">
        <section class="metric glass">
          <span class="metric-ico flame">${icon('flame')}</span>
          <span class="metric-val">${st.streak}</span>
          <span class="metric-lbl">Série en cours</span>
        </section>
        <section class="metric glass">
          <span class="metric-ico">${icon('target')}</span>
          <span class="metric-val">${st.rpeAvg == null ? '0' : L.formatNumber(st.rpeAvg, 1)}</span>
          <span class="metric-lbl">RPE moyen${st.rpeCount ? ` (${st.rpeCount})` : ''}</span>
        </section>
      </div>

      <section class="card glass">
        <div class="card-head"><h3>Par semaine</h3><span class="muted small">séances faites</span></div>
        ${chart(st.perWeek, ws.week, !ws.before)}
      </section>

      <section class="card glass tests-card">
        <div class="card-head"><h3>Tests</h3><span class="muted small">delta vs S${testWeeks[0] ?? 1}</span></div>
        <div class="t-table">
          <div class="t-row t-headrow"><span></span>${testWeeks.map((w) => `<span class="t-h ${w === ws.week && !ws.before ? 'cur' : ''}">S${w}</span>`).join('')}</div>
          ${testRows}
        </div>
      </section>

      <div class="folds">
        ${collapsible('Objectifs', db.program.goals, (g) => `<div class="fold-item"><strong>${esc(g.title)}</strong><p>${esc(g.text)}</p></div>`)}
        ${collapsible('Phases', db.program.phases, (p) => `<div class="fold-item"><strong>${esc(p.name)} <span class="muted">S${(p.weeks || []).join(', S')}</span></strong>${p.description ? `<p>${esc(p.description)}</p>` : ''}</div>`)}
        ${collapsible('Règles', db.program.rules, (r) => `<div class="fold-item"><strong>${esc(r.title)}</strong><p>${esc(r.text)}</p></div>`)}
        ${collapsible('Glossaire', db.glossary, (g) => `<div class="fold-item"><strong>${esc(g.term)}</strong><p>${esc(g.text)}</p></div>`)}
      </div>`,
  };
}
