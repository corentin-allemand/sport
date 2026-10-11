import * as L from './logic.js';
import { esc, icon, thumb } from './ui.js';

// Héro : animation MP4 > alternance d'images > visuel de remplacement.
function heroHtml(ex) {
  const imgs = (ex.media?.images || []).filter(Boolean).slice(0, 2);
  const anim = ex.media?.animation;
  if (anim) {
    return `
      <figure class="ex-hero ex-hero-video">
        <video src="${esc(anim)}" ${imgs[0] ? `poster="${esc(imgs[0])}"` : ''} autoplay loop muted playsinline preload="metadata" aria-label="Animation : ${esc(ex.name)}"></video>
      </figure>`;
  }
  if (imgs.length) {
    return `
      <figure class="ex-hero" data-frames="${imgs.length}">
        ${imgs.map((src, i) => `<img src="${esc(src)}" alt="${esc(ex.name)}, position ${i + 1}" class="${i === 0 ? 'is-on' : ''}" decoding="async">`).join('')}
        ${imgs.length > 1 ? `<span class="frame-dots" aria-hidden="true"><i class="is-on"></i><i></i></span>` : ''}
      </figure>`;
  }
  return `
    <figure class="ex-hero ex-hero-empty">
      <span class="ex-hero-ico">${icon('dumbbell')}</span>
      <span class="ex-hero-name">${esc(ex.name)}</span>
    </figure>`;
}

export function viewExercise({ db }, params) {
  const ex = L.exerciseById(db, params[0]);
  if (!ex) {
    return {
      html: `
        <div class="topbar"><button class="icon-btn glass" data-action="back" data-fallback="#/exercices" aria-label="Retour">${icon('back')}</button></div>
        <section class="empty glass"><p class="eyebrow">Introuvable</p><h2>Cet exercice n'existe pas.</h2><a class="btn btn-ghost" href="#/exercices">Voir la bibliothèque</a></section>`,
    };
  }
  const video = ex.media?.video;
  const group = L.groupName(db, ex.group);
  const alts = L.alternativesOf(db, ex.id);

  const muscles = (ex.muscles || []).map((m) => `<span class="tag-soft">${esc(m)}</span>`).join('');
  const cues = (ex.cues || []).map((c) => `<li><span class="cue-ico">${icon('check')}</span><span>${esc(c)}</span></li>`).join('');

  const altHtml = alts.length ? `
    <section class="alt-section">
      <div class="section-head"><h3>Alternatives</h3><span class="muted small">${esc(group || 'même groupe')}</span></div>
      <div class="ex-list glass">
        ${alts.map((a) => `
          <a class="ex-row" href="#/exercice/${esc(a.id)}">
            ${thumb(a)}
            <span class="ex-body">
              <span class="ex-name">${esc(a.name)}</span>
              ${a.equipment ? `<span class="ex-note">${esc(a.equipment)}</span>` : ''}
            </span>
            ${icon('chevron', 'ex-chev')}
          </a>`).join('')}
      </div>
    </section>` : '';

  return {
    html: `
      <div class="topbar topbar-float">
        <button class="icon-btn glass" data-action="back" data-fallback="#/exercices" aria-label="Retour">${icon('back')}</button>
      </div>
      ${heroHtml(ex)}
      <header class="page-head ex-head">
        ${group ? `<p class="eyebrow accent">${esc(group)}</p>` : ''}
        <h1 class="page-title">${esc(ex.name)}</h1>
        ${ex.aka ? `<p class="aka">${esc(ex.aka)}</p>` : ''}
        ${muscles ? `<div class="tags">${muscles}</div>` : ''}
      </header>
      ${ex.description ? `<p class="ex-desc">${esc(ex.description)}</p>` : ''}
      ${cues ? `<section class="card glass"><h3 class="card-title">Points clés</h3><ul class="cues">${cues}</ul></section>` : ''}
      ${ex.equipment ? `
        <div class="kv glass">
          <span class="row-ico">${icon('dumbbell')}</span>
          <span class="row-text"><span>Matériel</span><strong>${esc(ex.equipment)}</strong></span>
        </div>` : ''}
      ${video ? `<a class="btn btn-ghost btn-block btn-lg" href="${esc(video)}" target="_blank" rel="noopener">${icon('play')}Voir en vidéo</a>` : ''}
      ${altHtml}`,
    mount(root) {
      const vid = root.querySelector('.ex-hero-video video');
      if (vid) {
        // Mouvement réduit : pas de lecture automatique, contrôles natifs à la place.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          vid.removeAttribute('autoplay');
          vid.pause();
          vid.controls = true;
        } else {
          vid.play?.().catch(() => { vid.controls = true; });
        }
        return () => { vid.pause(); vid.removeAttribute('src'); vid.load(); };
      }
      const fig = root.querySelector('.ex-hero[data-frames="2"]');
      if (!fig) return;
      const frames = fig.querySelectorAll('img');
      const dots = fig.querySelectorAll('.frame-dots i');
      let i = 0;
      const t = setInterval(() => {
        i = 1 - i;
        frames.forEach((f, k) => f.classList.toggle('is-on', k === i));
        dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
      }, 700);
      return () => clearInterval(t);
    },
  };
}
