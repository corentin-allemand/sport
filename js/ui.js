// Petits utilitaires d'interface : échappement, icônes, toast, feuille modale.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const P = {
  today: '<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12L13 2Z"/>',
  list: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  play: '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
  calendarPlus: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M12 12.5v5M9.5 15h5"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.2-5.7-3.6-7.5-.4 1.9-1.3 3-2.4 3.5C13 7 11.6 4.3 9 2c.3 3-1.4 5.3-3 7.3C4.9 10.8 5 12.6 5 15c0 4.2 3 7 7 7Z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  skip: '<path d="M5 5v14l9-7-9-7ZM19 5v14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9.5Z"/>',
  gym: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5V6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  swap: '<path d="M7.5 3.5 4 7l3.5 3.5"/><path d="M4 7h16"/><path d="M16.5 13.5 20 17l-3.5 3.5"/><path d="M20 17H4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4.5 20.5h15"/>',
  upload: '<path d="M12 15.5v-12M7 8.5l5-5 5 5M4.5 20.5h15"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// Vignette d'exercice : image (cadre clair, photos sur fond blanc), sinon
// première image de l'animation (fond sombre), sinon visuel de remplacement.
export function thumb(ex, cls = '') {
  const img = ex?.media?.images?.[0];
  if (img) return `<span class="thumb ${cls}"><img src="${esc(img)}" alt="" loading="lazy" decoding="async"></span>`;
  const anim = ex?.media?.animation;
  if (anim) return `<span class="thumb thumb-video ${cls}"><video src="${esc(anim)}#t=0.1" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video><span class="thumb-play">${icon('play')}</span></span>`;
  return `<span class="thumb thumb-empty ${cls}">${icon('dumbbell')}</span>`;
}

export const STATUS = {
  done: { label: 'Faite', cls: 's-done', icon: 'check' },
  missed: { label: 'Manquée', cls: 's-missed', icon: 'alert' },
  today: { label: "Aujourd'hui", cls: 's-today', icon: 'today' },
  upcoming: { label: 'À venir', cls: 's-upcoming', icon: 'clock' },
  skipped: { label: 'Sautée', cls: 's-skipped', icon: 'skip' },
};

export function statusChip(status) {
  const s = STATUS[status] || STATUS.upcoming;
  return `<span class="chip ${s.cls}"><span class="chip-dot"></span>${s.label}</span>`;
}

// Toast discret

let toastTimer = null;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
}

// Feuille modale (bottom sheet)

let currentSheet = null;

export function openSheet({ title, subtitle = '', body, onMount }) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <div>
          <h2 class="sheet-title">${esc(title)}</h2>
          ${subtitle ? `<p class="sheet-sub">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" type="button" data-sheet-close aria-label="Fermer">${icon('x')}</button>
      </div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('has-sheet');
  void wrap.offsetWidth; // reflow : la transition part sans dépendre d'une frame
  wrap.classList.add('is-open');
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
  document.addEventListener('keydown', onKey);
  currentSheet = { wrap, onKey };
  onMount?.(wrap.querySelector('.sheet'));
  return wrap;
}

export function closeSheet(immediate = false) {
  if (!currentSheet) return;
  const { wrap, onKey } = currentSheet;
  currentSheet = null;
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('has-sheet');
  if (immediate) { wrap.remove(); return; }
  wrap.classList.remove('is-open');
  setTimeout(() => wrap.remove(), 320);
}

export const sheetIsOpen = () => !!currentSheet;
