// Sélecteur d'exercice réutilisable : feuille avec recherche et filtre par groupe.
import * as L from './logic.js';
import { esc, icon, thumb, openSheet, closeSheet } from './ui.js';
import { groupPills, searchField, bindFilter } from './view-library.js';

export function openExercisePicker({ exercises, groups, title = 'Choisir un exercice', subtitle = '', selectedId = null, onPick }) {
  const list = [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const gName = (id) => groups.find((g) => g.id === id)?.name || 'Sans groupe';
  const state = { q: '', group: '' };
  openSheet({
    title,
    subtitle,
    body: `
      <div class="picker">
        ${searchField('')}
        ${groups.length ? groupPills(groups, list, '') : ''}
        <div class="pick-list">
          ${list.map((ex) => `
            <button type="button" class="pick-row ${ex.id === selectedId ? 'is-on' : ''}" data-id="${esc(ex.id)}" data-group="${esc(ex.group || '')}" data-hay="${esc(L.exerciseHaystack(ex))}">
              ${thumb(ex)}
              <span class="ex-body"><span class="ex-name">${esc(ex.name || ex.id)}</span><span class="ex-note">${esc(gName(ex.group))}</span></span>
              <span class="pick-check">${ex.id === selectedId ? icon('check') : ''}</span>
            </button>`).join('')}
          <p class="empty-soft" id="pick-empty" hidden>Aucun exercice ne correspond.</p>
        </div>
      </div>`,
    onMount(sheet) {
      sheet.classList.add('sheet-tall');
      bindFilter(sheet, { state, items: '.pick-row', empty: '#pick-empty' });
      sheet.querySelector('.pick-list').addEventListener('click', (e) => {
        const b = e.target.closest('.pick-row');
        if (!b) return;
        closeSheet();
        onPick?.(b.dataset.id);
      });
    },
  });
}
