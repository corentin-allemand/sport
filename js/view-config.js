// Configuration : éditeur de la base programme, modèle brouillon.
// Le brouillon est une copie profonde de la config, éditée localement,
// enregistrée d'un bloc dans le store local (js/store.js).
import * as L from './logic.js';
import { store } from './store.js';
import { esc, icon, thumb, toast, openSheet, closeSheet } from './ui.js';
import { openExercisePicker } from './picker.js';
import { groupPills, searchField, bindFilter } from './view-library.js';

const KEYS = ['program', 'exercises', 'sessions', 'tests', 'glossary', 'muscleGroups'];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const PHASES = ['p1', 'p2', 'p3', 'p4'];
const SECTIONS = [
  { id: 'programme', label: 'Programme' },
  { id: 'seances', label: 'Séances' },
  { id: 'exercices', label: 'Exercices' },
  { id: 'groupes', label: 'Groupes' },
  { id: 'donnees', label: 'Données' },
];

const cfg = {
  draft: null,
  baseSig: '',
  dbRef: null,
  section: 'programme',
  sessionId: null,
  openItem: null,
  reveal: false,
  errors: [],
  saving: false,
  exFilter: { q: '', group: '' },
};

function snapshot(db) {
  const o = {};
  for (const k of KEYS) o[k] = structuredClone(db[k] ?? (k === 'program' ? {} : []));
  return o;
}

function ensureDraft(db) {
  if (!cfg.draft || (cfg.dbRef !== db && !configDirty())) {
    cfg.draft = snapshot(db);
    cfg.baseSig = JSON.stringify(cfg.draft);
    cfg.dbRef = db;
  }
}

export function configDirty() {
  return !!cfg.draft && JSON.stringify(cfg.draft) !== cfg.baseSig;
}

export function discardConfig() {
  cfg.draft = null;
  cfg.errors = [];
  cfg.openItem = null;
}

function payload() {
  const d = structuredClone(cfg.draft);
  d.exercises = d.exercises.map(({ media, ...rest }) => rest);
  return d;
}

function parseErrors(data) {
  const list = Array.isArray(data?.errors) ? data.errors : Array.isArray(data) ? data : null;
  if (list?.length) {
    return list.map((e) => (typeof e === 'string' ? e : e?.message || e?.error || [e?.path, e?.reason].filter(Boolean).join(' : ') || JSON.stringify(e)));
  }
  const one = data?.error || data?.message;
  return [typeof one === 'string' && one ? one : 'La configuration a été refusée par le serveur.'];
}

// Enregistre le brouillon. Renvoie true si tout est passé.
export async function saveConfig(ctx) {
  if (!cfg.draft || cfg.saving) return false;
  cfg.saving = true;
  cfg.errors = [];
  ctx.rerender();
  try {
    const db = await store.saveConfig(payload());
    await ctx.setDb(db);
    discardConfig();
    toast('Configuration enregistrée');
    return true;
  } catch (err) {
    if (err?.status === 400) {
      cfg.errors = parseErrors(err.data);
      toast(`${cfg.errors.length > 1 ? `${cfg.errors.length} erreurs` : 'Une erreur'} à corriger`, 'error');
    } else {
      toast('Configuration non enregistrée, réessaie', 'error');
    }
    return false;
  } finally {
    cfg.saving = false;
    ctx.rerender();
    if (cfg.errors.length) requestAnimationFrame(() => document.getElementById('cfg-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}

// Chemins de données : "sessions.2.blocks.0.items.3.note"
function setPath(obj, path, value) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    if (k === 'prescription' && typeof o[k] === 'string') {
      const s = o[k];
      o[k] = { p1: s, p2: s, p3: s, p4: s };
    }
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    o = o[k];
  }
  const last = ks[ks.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

// Champs

function field(label, input, hint = '') {
  return `<label class="ffield"><span class="flabel">${label}</span>${input}${hint ? `<span class="fhint">${hint}</span>` : ''}</label>`;
}
function textInput(path, value, attrs = '') {
  return `<input class="finput" type="text" data-bind="${esc(path)}" value="${esc(value ?? '')}" ${attrs}>`;
}

// Sections

function sectionProgramme(d, ctx) {
  const p = d.program || {};
  const phases = p.phases || [];
  const autoRest = L.autoRestOn(ctx.db);
  const gyms = (d.sessions || []).filter((s) => s.kind !== 'home');
  const start = p.startDate && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null;
  return `
    <section class="card glass form-card">
      <h3 class="card-title">Programme</h3>
      ${field('Nom', textInput('program.name', p.name, 'maxlength="80"'))}
      ${field('Date de début', `<input class="finput" type="date" data-bind="program.startDate" value="${esc(p.startDate || '')}">`,
        `<span id="start-hint">${start ? `${esc(L.formatLong(start))}, début de la semaine 1` : 'Lundi de la semaine 1'}</span>`)}
    </section>
    <section class="card glass form-card">
      <div class="card-head"><h3>Jours des séances salle</h3></div>
      <div class="sched">
        ${gyms.map((s) => `
          <label class="sched-row">
            <span class="sess-letter">${esc(s.id)}</span>
            <span class="sched-name">${esc(s.name || `Séance ${s.id}`)}</span>
            <span class="select-wrap">
              <select class="finput fselect" data-bind="program.schedule.${esc(s.id)}" data-type="int" aria-label="Jour de la séance ${esc(s.id)}">
                ${!p.schedule?.[s.id] ? '<option value="" selected disabled>Choisir</option>' : ''}
                ${DAYS.map((day, i) => `<option value="${i + 1}" ${Number(p.schedule?.[s.id]) === i + 1 ? 'selected' : ''}>${day}</option>`).join('')}
              </select>
              ${icon('down', 'select-caret')}
            </span>
          </label>`).join('')}
      </div>
    </section>
    <section class="card glass form-card">
      <div class="card-head"><h3>Minuteur de repos</h3></div>
      <label class="switch-row">
        <span class="switch-text"><strong>Lancer le repos en cochant une série</strong><span class="fhint">Réglage enregistré tout de suite, sur ce téléphone.</span></span>
        <input type="checkbox" class="switch" id="auto-rest" role="switch" ${autoRest ? 'checked' : ''}>
      </label>
      <div class="rest-grid">
        ${PHASES.map((ph, k) => {
          const name = phases.find((x) => x.id === ph)?.name || ph.toUpperCase();
          const v = p.restDefaults?.[ph];
          return field(`<span class="rx-ph">${k + 1}</span>${esc(name)}`,
            `<span class="num-suffix"><input class="finput" type="number" inputmode="numeric" min="5" max="900" step="5" data-bind="program.restDefaults.${ph}" data-type="int" value="${esc(v ?? '')}" placeholder="${L.REST_FALLBACK[ph]}" aria-label="Repos phase ${k + 1}, en secondes"><span>s</span></span>`);
        }).join('')}
      </div>
      <p class="fhint">Durée du repos lancé à chaque série cochée, selon la phase de la semaine.</p>
    </section>`;
}

function rxSummary(it) {
  const vals = PHASES.map((ph) => L.prescriptionFor(it, ph)).filter((v) => v != null);
  if (!vals.length) return 'Sans prescription';
  const uniq = [...new Set(vals.filter(Boolean))];
  if (!uniq.length) return 'Masqué';
  return uniq.length === 1 ? uniq[0] : vals.map((v) => v || '-').join(' · ');
}

function itemHtml(d, si, bi, ii, it, count) {
  const ex = d.exercises.find((e) => e.id === it.exerciseId);
  const key = `${si}.${bi}.${ii}`;
  const base = `sessions.${si}.blocks.${bi}.items.${ii}`;
  const phases = d.program?.phases || [];
  const rxObj = typeof it.prescription === 'string' ? { p1: it.prescription, p2: it.prescription, p3: it.prescription, p4: it.prescription } : (it.prescription || {});
  return `
    <details class="citem glass" data-key="${key}" ${cfg.openItem === key ? 'open' : ''}>
      <summary class="citem-sum">
        ${thumb(ex)}
        <span class="ex-body">
          <span class="ex-name">${esc(ex?.name || it.exerciseId || 'Exercice manquant')}</span>
          <span class="ex-note citem-rx" data-rx="${key}">${esc(rxSummary(it))}</span>
        </span>
        ${icon('down', 'fold-caret')}
      </summary>
      <div class="citem-body">
        <button type="button" class="pick-trigger" data-cfg="change-ex" data-si="${si}" data-bi="${bi}" data-ii="${ii}">
          <span class="pick-trigger-text"><span class="flabel">Exercice</span><strong>${esc(ex?.name || it.exerciseId || 'Choisir')}</strong></span>
          <span class="pick-trigger-cta">Changer ${icon('chevron')}</span>
        </button>
        <div class="rx-grid">
          ${PHASES.map((ph, k) => {
            const name = phases.find((x) => x.id === ph)?.name || ph.toUpperCase();
            return field(`<span class="rx-ph">${k + 1}</span>${esc(name)}`,
              `<input class="finput" type="text" data-bind="${base}.prescription.${ph}" data-rx-of="${key}" ${ph === 'p4' ? 'data-empty="unset"' : ''} value="${esc(rxObj[ph] ?? '')}" placeholder="${ph === 'p4' ? 'Comme phase 1' : 'Non prévu'}">`);
          }).join('')}
        </div>
        ${field('Note', textInput(`${base}.note`, it.note, 'placeholder="Consigne courte, facultatif" data-empty="unset"'))}
        <div class="citem-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-cfg="move" data-dir="-1" data-si="${si}" data-bi="${bi}" data-ii="${ii}" ${ii === 0 ? 'disabled' : ''} aria-label="Monter">${icon('up')}Monter</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cfg="move" data-dir="1" data-si="${si}" data-bi="${bi}" data-ii="${ii}" ${ii === count - 1 ? 'disabled' : ''} aria-label="Descendre">${icon('down')}Descendre</button>
          <button type="button" class="btn btn-danger btn-sm" data-cfg="del-item" data-si="${si}" data-bi="${bi}" data-ii="${ii}" aria-label="Supprimer">${icon('trash')}</button>
        </div>
      </div>
    </details>`;
}

function sectionSessions(d) {
  const sessions = d.sessions || [];
  if (!sessions.length) return '<p class="muted">Aucune séance.</p>';
  if (!sessions.some((s) => s.id === cfg.sessionId)) cfg.sessionId = sessions[0].id;
  const si = sessions.findIndex((s) => s.id === cfg.sessionId);
  const s = sessions[si];
  return `
    <div class="pills-scroll" role="radiogroup" aria-label="Séance">
      ${sessions.map((x) => `<button type="button" class="fpill ${x.id === s.id ? 'is-on' : ''}" role="radio" aria-checked="${x.id === s.id}" data-cfg="session" data-id="${esc(x.id)}">${esc(x.id)}<span>${x.kind === 'home' ? 'maison' : 'salle'}</span></button>`).join('')}
    </div>
    <section class="card glass form-card">
      ${field('Nom de la séance', textInput(`sessions.${si}.name`, s.name, 'maxlength="80"'))}
      ${field('Durée', textInput(`sessions.${si}.duration`, s.duration, 'placeholder="ex. 60 min" data-empty="unset"'))}
    </section>
    ${(s.blocks || []).map((b, bi) => `
      <section class="block">
        <div class="block-head">
          <h3>${esc(b.title || `Bloc ${bi + 1}`)}</h3>
          <span class="muted small">${(b.items || []).length} exercice${(b.items || []).length > 1 ? 's' : ''}</span>
        </div>
        ${b.rounds && typeof b.rounds === 'object' ? `
          <div class="rounds-edit glass">
            <span class="flabel">${icon('repeat')}Tours par phase</span>
            <div class="rounds-grid">
              ${PHASES.map((ph, k) => `<label class="round-cell"><span>${k + 1}</span><input class="finput" type="number" inputmode="numeric" min="1" max="20" data-bind="sessions.${si}.blocks.${bi}.rounds.${ph}" data-type="int" value="${esc(b.rounds[ph] ?? '')}" aria-label="Tours phase ${k + 1}"></label>`).join('')}
            </div>
          </div>` : ''}
        <div class="citems">
          ${(b.items || []).map((it, ii) => itemHtml(d, si, bi, ii, it, b.items.length)).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-block add-btn" data-cfg="add-item" data-si="${si}" data-bi="${bi}">${icon('plus')}Ajouter un exercice</button>
      </section>`).join('')}`;
}

function sectionExercises(d) {
  const list = [...d.exercises].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  const gName = (id) => d.muscleGroups.find((g) => g.id === id)?.name || 'Sans groupe';
  return `
    <button type="button" class="btn btn-primary btn-block" data-cfg="new-ex">${icon('plus')}Nouvel exercice</button>
    ${searchField(cfg.exFilter.q)}
    ${d.muscleGroups.length ? groupPills(d.muscleGroups, list, cfg.exFilter.group) : ''}
    <div class="ex-list glass">
      ${list.map((ex) => {
        const used = L.exerciseUsage(d, ex.id).length;
        return `
          <button type="button" class="ex-row cex-row" data-cfg="edit-ex" data-id="${esc(ex.id)}" data-group="${esc(ex.group || '')}" data-hay="${esc(L.exerciseHaystack(ex))}">
            ${thumb(ex)}
            <span class="ex-body">
              <span class="ex-name">${esc(ex.name || ex.id)}</span>
              <span class="ex-note">${esc(gName(ex.group))}${used ? ` · utilisé ${used} fois` : ''}</span>
            </span>
            ${icon('edit', 'ex-chev')}
          </button>`;
      }).join('')}
      <p class="empty-soft" id="cex-empty" hidden>Aucun exercice ne correspond.</p>
    </div>`;
}

function sectionGroups(d) {
  return `
    <section class="card glass form-card">
      <div class="card-head"><h3>Groupes musculaires</h3><span class="muted small">${d.muscleGroups.length}</span></div>
      <div class="grp-list">
        ${d.muscleGroups.map((g, i) => {
          const n = d.exercises.filter((e) => e.group === g.id).length;
          return `
            <div class="grp-row">
              <input class="finput" type="text" data-bind="muscleGroups.${i}.name" value="${esc(g.name)}" aria-label="Nom du groupe ${esc(g.id)}" maxlength="40">
              <span class="grp-count ${n < 2 ? 'is-low' : ''}">${n} ex.</span>
            </div>`;
        }).join('')}
      </div>
      <p class="fhint">Chaque groupe doit compter au moins 2 exercices pour offrir une alternative.</p>
    </section>
    <section class="card glass form-card">
      <h3 class="card-title">Nouveau groupe</h3>
      <div class="inline-add">
        <input class="finput" type="text" id="new-group" placeholder="ex. Mollets" maxlength="40" aria-label="Nom du nouveau groupe">
        <button type="button" class="btn btn-primary btn-sm" data-cfg="add-group">${icon('plus')}Ajouter</button>
      </div>
    </section>`;
}

// Données : sauvegarde, restauration, programme d'origine

export function setConfigSection(id) {
  if (SECTIONS.some((s) => s.id === id)) cfg.section = id;
}

function formatStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function sectionData(ctx) {
  const meta = ctx.meta || {};
  const last = formatStamp(meta.lastExportAt);
  return `
    <section class="card glass form-card">
      <div class="card-head"><h3>Sauvegarde</h3></div>
      <p class="muted small">Tes données vivent uniquement sur ce téléphone. Exporte-les de temps en temps et garde le fichier dans iCloud Drive ou Fichiers.</p>
      <button type="button" class="btn btn-primary btn-block" data-cfg="export">${icon('download')}Exporter mes données</button>
      <button type="button" class="btn btn-ghost btn-block" data-cfg="import">${icon('upload')}Importer une sauvegarde</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <p class="fhint">${last ? `Dernier export : ${esc(last)}` : 'Aucun export pour l\'instant'}</p>
    </section>
    <section class="card glass form-card">
      <div class="card-head"><h3>Programme</h3><span class="muted small">version ${esc(ctx.db.programVersion ?? 1)}</span></div>
      <button type="button" class="row-link glass" id="undo-row" data-cfg="undo-config" hidden>
        <span class="row-ico">${icon('undo')}</span>
        <span class="row-text"><strong>Restaurer la configuration précédente</strong><span></span></span>
        ${icon('chevron', 'muted')}
      </button>
      <button type="button" class="btn btn-danger btn-block" data-cfg="reset">${icon('repeat')}Réinitialiser le programme</button>
      <p class="fhint">Remet le programme d'origine. Le journal (séances, tests) est conservé.</p>
    </section>`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function exportData(ctx) {
  try {
    const data = await store.exportData();
    downloadJson(data, `sport-backup-${L.todayISO()}.json`);
    toast('Sauvegarde exportée');
  } catch {
    toast('Export impossible', 'error');
  }
  ctx.rerender();
}

async function readBackup(ctx, file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Fichier illisible : JSON attendu', 'error');
    return;
  }
  const errors = store.checkBackup(data);
  if (errors.length) {
    cfg.errors = errors;
    toast('Sauvegarde invalide', 'error');
    ctx.rerender();
    requestAnimationFrame(() => document.getElementById('cfg-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return;
  }
  const logs = Array.isArray(data.logs) ? data.logs.length : 0;
  const tests = Array.isArray(data.testResults) ? data.testResults.length : 0;
  const when = formatStamp(data.exportedAt);
  openSheet({
    title: 'Importer cette sauvegarde ?',
    subtitle: when ? `Exportée le ${when}` : file.name,
    body: `
      <p class="muted">${logs} séance${logs > 1 ? 's' : ''} notée${logs > 1 ? 's' : ''}, ${tests} résultat${tests > 1 ? 's' : ''} de test. Toutes les données actuelles de ce téléphone seront remplacées.</p>
      <button type="button" class="btn btn-primary btn-block btn-lg" id="imp-go">${icon('check')}Remplacer mes données</button>
      <button type="button" class="btn btn-ghost btn-block" data-sheet-close>Annuler</button>`,
    onMount(sheet) {
      sheet.querySelector('#imp-go').addEventListener('click', async () => {
        closeSheet();
        const errs = await store.importData(data).catch(() => ['Import impossible']);
        if (errs.length) { cfg.errors = errs; toast('Import refusé', 'error'); ctx.rerender(); return; }
        discardConfig();
        await ctx.reload();
        toast('Sauvegarde importée');
      });
    },
  });
}

function confirmSheet(ctx, { title, subtitle, text, label, iconName, danger, run, done }) {
  openSheet({
    title,
    subtitle,
    body: `
      <p class="muted">${text}</p>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block btn-lg" id="confirm-go">${icon(iconName)}${label}</button>
      <button type="button" class="btn btn-ghost btn-block" data-sheet-close>Annuler</button>`,
    onMount(sheet) {
      sheet.querySelector('#confirm-go').addEventListener('click', async () => {
        closeSheet();
        try {
          await run();
          discardConfig();
          await ctx.reload();
          toast(done);
        } catch {
          toast('Opération impossible, réessaie', 'error');
        }
      });
    },
  });
}

function openResetSheet(ctx) {
  confirmSheet(ctx, {
    title: 'Réinitialiser le programme ?',
    subtitle: 'Retour au programme d\'origine',
    text: 'Séances, exercices, groupes, tests et dates reviennent au programme livré avec l\'app. Ton journal est conservé, et la configuration actuelle reste restaurable.',
    label: 'Réinitialiser',
    iconName: 'repeat',
    danger: true,
    run: () => store.resetProgram(),
    done: 'Programme réinitialisé',
  });
}

function openUndoSheet(ctx) {
  confirmSheet(ctx, {
    title: 'Restaurer la configuration précédente ?',
    subtitle: 'Annule le dernier changement',
    text: 'La configuration revient à l\'état d\'avant le dernier enregistrement, la dernière réinitialisation ou le dernier import. Le journal n\'est pas modifié.',
    label: 'Restaurer',
    iconName: 'undo',
    run: () => store.undoConfig(),
    done: 'Configuration précédente restaurée',
  });
}

// Feuille d'édition d'un exercice (nouveau si id null)

function openExerciseSheet(ctx, id) {
  const d = cfg.draft;
  const ex = id ? d.exercises.find((e) => e.id === id) : null;
  const usage = ex ? L.exerciseUsage(d, ex.id) : [];
  const groups = d.muscleGroups;
  openSheet({
    title: ex ? 'Modifier l\'exercice' : 'Nouvel exercice',
    subtitle: ex ? ex.id : 'Ajouté à la bibliothèque à l\'enregistrement',
    body: `
      <div class="form-stack">
        ${field('Nom', `<input class="finput" id="xf-name" type="text" maxlength="80" value="${esc(ex?.name || '')}" placeholder="ex. Goblet squat">`)}
        ${field('Autre nom <span class="muted">(facultatif)</span>', `<input class="finput" id="xf-aka" type="text" maxlength="80" value="${esc(ex?.aka || '')}" placeholder="ex. ou squat haltère">`)}
        ${field('Groupe', `<span class="select-wrap"><select class="finput fselect" id="xf-group">
            ${!ex?.group ? '<option value="" selected disabled>Choisir un groupe</option>' : ''}
            ${groups.map((g) => `<option value="${esc(g.id)}" ${ex?.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
          </select>${icon('down', 'select-caret')}</span>`)}
        ${field('Muscles', `<input class="finput" id="xf-muscles" type="text" value="${esc((ex?.muscles || []).join(', '))}" placeholder="Quadriceps, Fessiers">`, 'Séparés par des virgules')}
        ${field('Description', `<textarea class="finput" id="xf-desc" rows="3" maxlength="600" placeholder="Comment le faire, 1 à 3 phrases.">${esc(ex?.description || '')}</textarea>`)}
        ${field('Points clés', `<textarea class="finput" id="xf-cues" rows="3" placeholder="Un point par ligne">${esc((ex?.cues || []).join('\n'))}</textarea>`, 'Un point par ligne')}
        ${field('Matériel', `<input class="finput" id="xf-equip" type="text" maxlength="60" value="${esc(ex?.equipment || '')}" placeholder="ex. Haltères">`)}
        <button type="button" class="btn btn-primary btn-block btn-lg" id="xf-ok">${icon('check')}${ex ? 'Appliquer' : 'Ajouter'}</button>
        ${ex ? (usage.length
          ? `<p class="note-box">${icon('alert')}<span>Suppression impossible : cet exercice est utilisé dans ${esc(usage.join(', '))}. Remplace-le d'abord partout où il apparaît.</span></p>`
          : `<button type="button" class="btn btn-danger btn-block" id="xf-del">${icon('trash')}Supprimer l'exercice</button>`) : ''}
      </div>`,
    onMount(sheet) {
      sheet.classList.add('sheet-tall');
      const $ = (s) => sheet.querySelector(s);
      if (!ex) setTimeout(() => $('#xf-name').focus(), 300);
      $('#xf-ok').addEventListener('click', () => {
        const name = $('#xf-name').value.trim();
        const group = $('#xf-group').value;
        if (!ex && !name) { $('#xf-name').classList.add('is-bad'); $('#xf-name').focus(); return; }
        if (!ex && !group) { $('#xf-group').classList.add('is-bad'); return; }
        const next = {
          name,
          aka: $('#xf-aka').value.trim(),
          group,
          muscles: $('#xf-muscles').value.split(',').map((s) => s.trim()).filter(Boolean),
          description: $('#xf-desc').value.trim(),
          cues: $('#xf-cues').value.split('\n').map((s) => s.trim()).filter(Boolean),
          equipment: $('#xf-equip').value.trim(),
        };
        if (ex) {
          Object.assign(ex, next);
          if (!next.aka) delete ex.aka;
          if (!next.group) ex.group = ex.group || '';
        } else {
          const nid = L.uniqueId(L.slugify(name), new Set(d.exercises.map((e) => e.id)));
          const created = { id: nid, ...next };
          if (!created.aka) delete created.aka;
          d.exercises.push(created);
        }
        closeSheet();
        toast(ex ? 'Exercice modifié' : 'Exercice ajouté au brouillon');
        ctx.rerender();
      });
      $('#xf-del')?.addEventListener('click', () => {
        d.exercises = d.exercises.filter((e) => e.id !== ex.id);
        closeSheet();
        toast('Exercice retiré du brouillon');
        ctx.rerender();
      });
    },
  });
}

// Vue

export function viewConfig(ctx) {
  ensureDraft(ctx.db);
  const d = cfg.draft;
  const dirty = configDirty();
  const sec = SECTIONS.some((s) => s.id === cfg.section) ? cfg.section : 'programme';

  const body = sec === 'programme' ? sectionProgramme(d, ctx)
    : sec === 'seances' ? sectionSessions(d)
      : sec === 'exercices' ? sectionExercises(d)
        : sec === 'groupes' ? sectionGroups(d)
          : sectionData(ctx);

  const errors = cfg.errors.length ? `
    <section class="card glass card-errors" id="cfg-errors" role="alert">
      <div class="card-head"><h3>${cfg.errors.length > 1 ? `${cfg.errors.length} erreurs de validation` : 'Erreur de validation'}</h3></div>
      <ul class="err-list">${cfg.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      <p class="muted small">Rien n'a été enregistré. Corrige puis enregistre à nouveau.</p>
    </section>` : '';

  return {
    html: `
      <div class="topbar">
        <button class="icon-btn glass" data-action="back" data-fallback="#/" aria-label="Retour">${icon('back')}</button>
      </div>
      <header class="page-head">
        <p class="eyebrow">Base programme</p>
        <h1 class="page-title">Configuration</h1>
      </header>
      ${errors}
      <div class="tabs-seg glass" role="tablist" aria-label="Sections">
        ${SECTIONS.map((s) => `<button type="button" role="tab" aria-selected="${s.id === sec}" class="${s.id === sec ? 'is-on' : ''}" data-cfg="section" data-id="${s.id}">${s.label}</button>`).join('')}
      </div>
      <div class="cfg-body">${body}</div>
      <div class="savebar glass-strong ${dirty || cfg.saving ? 'is-on' : ''}" role="region" aria-label="Modifications">
        <span class="savebar-text"><span class="savebar-dot"></span>Modifications non enregistrées</span>
        <div class="savebar-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-cfg="discard" ${cfg.saving ? 'disabled' : ''}>Annuler</button>
          <button type="button" class="btn btn-primary btn-sm" data-cfg="save" ${cfg.saving ? 'disabled' : ''}>${cfg.saving ? 'Envoi...' : 'Enregistrer'}</button>
        </div>
      </div>`,
    mount(root) {
      // Hors de la vue : son animation d'entrée (transform) piégerait le position: fixed.
      const bar = root.querySelector('.savebar');
      document.body.appendChild(bar);
      const sync = () => {
        const on = configDirty() || cfg.saving;
        bar.classList.toggle('is-on', on);
        document.body.classList.toggle('has-savebar', on);
      };
      sync();
      if (cfg.reveal) {
        cfg.reveal = false;
        root.querySelector('.citem[open]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
      }

      const onInput = (e) => {
        if (e.target.id === 'auto-rest') {
          if (e.type !== 'change') return;
          const on = e.target.checked;
          ctx.db.preferences = { ...(ctx.db.preferences || {}), autoRest: on };
          store.saveAutoRest(on)
            .then(() => toast(on ? 'Repos lancé en cochant une série' : 'Repos automatique désactivé'))
            .catch(() => { e.target.checked = !on; toast('Réglage non enregistré, réessaie', 'error'); ctx.reload(); });
          return;
        }
        const el = e.target.closest('[data-bind]');
        if (!el) return;
        let v = el.value;
        if (el.dataset.type === 'int') v = v === '' ? undefined : Math.round(Number(v));
        else if (v === '' && el.dataset.empty === 'unset') v = undefined;
        setPath(d, el.dataset.bind, v);
        el.classList.remove('is-bad');
        const rxKey = el.dataset.rxOf;
        if (rxKey) {
          const [si, bi, ii] = rxKey.split('.').map(Number);
          const out = root.querySelector(`[data-rx="${rxKey}"]`);
          if (out) out.textContent = rxSummary(d.sessions[si].blocks[bi].items[ii]);
        }
        if (el.dataset.bind === 'program.startDate') {
          const hint = root.querySelector('#start-hint');
          if (hint && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) hint.textContent = `${L.formatLong(el.value)}, début de la semaine 1`;
        }
        sync();
      };

      const onClick = (e) => {
        const el = e.target.closest('[data-cfg]');
        if (!el || el.disabled) return;
        const a = el.dataset.cfg;
        const si = Number(el.dataset.si), bi = Number(el.dataset.bi), ii = Number(el.dataset.ii);
        const items = () => d.sessions[si].blocks[bi].items;
        if (a === 'section') { cfg.section = el.dataset.id; cfg.openItem = null; cfg.errors = []; ctx.rerender(); window.scrollTo({ top: 0, behavior: 'instant' }); }
        else if (a === 'session') { cfg.sessionId = el.dataset.id; cfg.openItem = null; ctx.rerender(); }
        else if (a === 'move') {
          const list = items();
          const j = ii + Number(el.dataset.dir);
          if (j < 0 || j >= list.length) return;
          [list[ii], list[j]] = [list[j], list[ii]];
          cfg.openItem = `${si}.${bi}.${j}`;
          ctx.rerender();
        } else if (a === 'del-item') {
          items().splice(ii, 1);
          cfg.openItem = null;
          toast('Exercice retiré de la séance');
          ctx.rerender();
        } else if (a === 'change-ex' || a === 'add-item') {
          const current = a === 'change-ex' ? items()[ii].exerciseId : null;
          openExercisePicker({
            exercises: d.exercises,
            groups: d.muscleGroups,
            title: a === 'add-item' ? 'Ajouter un exercice' : 'Changer l\'exercice',
            subtitle: `${d.sessions[si].id} · ${d.sessions[si].blocks[bi].title || `Bloc ${bi + 1}`}`,
            selectedId: current,
            onPick(id) {
              if (a === 'change-ex') {
                items()[ii].exerciseId = id;
                cfg.openItem = `${si}.${bi}.${ii}`;
              } else {
                items().push({ exerciseId: id, prescription: { p1: '', p2: '', p3: '', p4: '' } });
                cfg.openItem = `${si}.${bi}.${items().length - 1}`;
              }
              cfg.reveal = true;
              ctx.rerender();
            },
          });
        } else if (a === 'new-ex') openExerciseSheet(ctx, null);
        else if (a === 'edit-ex') openExerciseSheet(ctx, el.dataset.id);
        else if (a === 'add-group') {
          const input = root.querySelector('#new-group');
          const name = input.value.trim();
          if (!name) { input.classList.add('is-bad'); input.focus(); return; }
          if (d.muscleGroups.some((g) => L.norm(g.name) === L.norm(name))) { input.classList.add('is-bad'); toast('Ce groupe existe déjà'); return; }
          const id = L.uniqueId(L.slugify(name), new Set(d.muscleGroups.map((g) => g.id)));
          d.muscleGroups.push({ id, name });
          ctx.rerender();
        } else if (a === 'discard') {
          discardConfig();
          toast('Modifications annulées');
          ctx.rerender();
        } else if (a === 'save') saveConfig(ctx);
        else if (a === 'export') exportData(ctx);
        else if (a === 'import') root.querySelector('#import-file')?.click();
        else if (a === 'reset') openResetSheet(ctx);
        else if (a === 'undo-config') openUndoSheet(ctx);
      };

      const onFile = (e) => {
        if (e.target.id !== 'import-file') return;
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) readBackup(ctx, file);
      };

      // Mémorise l'item ouvert pour le retrouver après un rendu.
      const onToggle = (e) => {
        const det = e.target;
        if (!det.classList?.contains('citem')) return;
        if (det.open) {
          cfg.openItem = det.dataset.key;
          root.querySelectorAll('.citem[open]').forEach((x) => { if (x !== det) x.open = false; });
        } else if (cfg.openItem === det.dataset.key) cfg.openItem = null;
      };

      const onKey = (e) => {
        if (e.key === 'Enter' && e.target.id === 'new-group') root.querySelector('[data-cfg="add-group"]')?.click();
      };

      root.addEventListener('input', onInput);
      root.addEventListener('change', onInput);
      root.addEventListener('click', onClick);
      bar.addEventListener('click', onClick);
      root.addEventListener('toggle', onToggle, true);
      root.addEventListener('keydown', onKey);
      root.addEventListener('change', onFile);
      if (sec === 'donnees') {
        store.historyCount().then((n) => {
          const row = root.querySelector('#undo-row');
          if (row && n > 0) {
            row.hidden = false;
            row.querySelector('.row-text span').textContent = n > 1 ? `${n} versions gardées sur l'appareil` : '1 version gardée sur l\'appareil';
          }
        }).catch(() => {});
      }
      if (sec === 'exercices') bindFilter(root, { state: cfg.exFilter, items: '.cex-row', empty: '#cex-empty' });

      return () => {
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onInput);
        root.removeEventListener('click', onClick);
        root.removeEventListener('toggle', onToggle, true);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('change', onFile);
        bar.remove();
        document.body.classList.remove('has-savebar');
      };
    },
  };
}

// Garde-fou : confirmation avant de quitter avec des modifications.
export function openLeaveGuard(ctx, proceed) {
  openSheet({
    title: 'Modifications non enregistrées',
    subtitle: 'La configuration a changé depuis le dernier enregistrement.',
    body: `
      <button type="button" class="btn btn-primary btn-block btn-lg" id="lg-save">${icon('check')}Enregistrer et quitter</button>
      <button type="button" class="btn btn-ghost btn-block" data-sheet-close>Rester sur la page</button>
      <button type="button" class="btn btn-danger btn-block" id="lg-quit">${icon('trash')}Quitter sans enregistrer</button>`,
    onMount(sheet) {
      sheet.querySelector('#lg-quit').addEventListener('click', () => {
        discardConfig();
        closeSheet(true);
        proceed();
      });
      sheet.querySelector('#lg-save').addEventListener('click', async () => {
        closeSheet(true);
        if (await saveConfig(ctx)) proceed();
      });
    },
  });
}
