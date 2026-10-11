import * as L from './logic.js';
import { esc, icon, thumb } from './ui.js';

// Filtres conservés entre deux visites de la bibliothèque.
const filters = { q: '', group: '' };

// Pastilles de groupes musculaires (partagées avec le sélecteur d'exercice).
export function groupPills(groups, exercises, active) {
  const count = (id) => exercises.filter((e) => e.group === id).length;
  return `
    <div class="pills-scroll" role="radiogroup" aria-label="Groupe musculaire">
      <button type="button" class="fpill ${active ? '' : 'is-on'}" role="radio" aria-checked="${!active}" data-group="">Tous<span>${exercises.length}</span></button>
      ${groups.map((g) => `<button type="button" class="fpill ${active === g.id ? 'is-on' : ''}" role="radio" aria-checked="${active === g.id}" data-group="${esc(g.id)}">${esc(g.name)}<span>${count(g.id)}</span></button>`).join('')}
    </div>`;
}

export function searchField(value, placeholder = 'Rechercher un exercice') {
  return `
    <label class="search glass">
      ${icon('search')}
      <input type="search" class="search-input" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search" aria-label="${esc(placeholder)}">
      <button type="button" class="search-clear" aria-label="Effacer la recherche" ${value ? '' : 'hidden'}>${icon('x')}</button>
    </label>`;
}

// Filtre en place : chaque élément porte data-hay (texte normalisé) et data-group.
export function bindFilter(root, { state, items, empty, onChange }) {
  const input = root.querySelector('.search-input');
  const clear = root.querySelector('.search-clear');
  const pills = root.querySelectorAll('.fpill');
  const apply = () => {
    const q = L.norm(state.q);
    let shown = 0;
    root.querySelectorAll(items).forEach((el) => {
      const ok = (!state.group || el.dataset.group === state.group) && (!q || el.dataset.hay.includes(q));
      el.hidden = !ok;
      if (ok) shown++;
    });
    const e = root.querySelector(empty);
    if (e) e.hidden = shown > 0;
    clear.hidden = !state.q;
    onChange?.(shown);
  };
  input.addEventListener('input', () => { state.q = input.value; apply(); });
  clear.addEventListener('click', () => { state.q = ''; input.value = ''; input.focus(); apply(); });
  pills.forEach((p) => p.addEventListener('click', () => {
    state.group = p.dataset.group;
    pills.forEach((x) => {
      const on = x === p;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-checked', String(on));
    });
    p.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    apply();
  }));
  apply();
}

export function viewLibrary({ db }) {
  const groups = db.muscleGroups || [];
  const exercises = [...(db.exercises || [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (filters.group && !groups.some((g) => g.id === filters.group)) filters.group = '';

  const cards = exercises.map((ex) => `
    <a class="lib-card glass" href="#/exercice/${esc(ex.id)}" data-group="${esc(ex.group || '')}" data-hay="${esc(L.exerciseHaystack(ex))}">
      ${thumb(ex, 'lib-thumb')}
      <span class="lib-name">${esc(ex.name)}</span>
      <span class="lib-group">${esc(L.groupName(db, ex.group) || 'Sans groupe')}</span>
    </a>`).join('');

  return {
    html: `
      <header class="page-head">
        <p class="eyebrow">Bibliothèque</p>
        <h1 class="page-title">Exercices</h1>
        <p class="lead"><span id="lib-count">${exercises.length}</span> exercices</p>
      </header>
      ${searchField(filters.q)}
      ${groups.length ? groupPills(groups, exercises, filters.group) : ''}
      <div class="lib-grid">${cards}</div>
      <section class="empty-soft" id="lib-empty" hidden>
        <span class="empty-soft-ico">${icon('search')}</span>
        <p>Aucun exercice ne correspond.</p>
      </section>`,
    mount(root) {
      const count = root.querySelector('#lib-count');
      bindFilter(root, {
        state: filters,
        items: '.lib-card',
        empty: '#lib-empty',
        onChange: (n) => { count.textContent = n === exercises.length ? n : `${n} sur ${exercises.length}`; },
      });
    },
  };
}
