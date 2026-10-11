// Enregistrement du service worker et bandeau « Nouvelle version ».
import { icon } from './ui.js';

let reloading = false;

function showUpdateBar(worker) {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar glass-strong';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <span class="update-text"><span class="savebar-dot"></span>Nouvelle version</span>
    <button type="button" class="btn btn-primary btn-sm" id="update-go">${icon('repeat')}Mettre à jour</button>`;
  document.body.appendChild(bar);
  void bar.offsetWidth;
  bar.classList.add('is-on');
  bar.querySelector('#update-go').addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    worker.postMessage({ type: 'skip-waiting' });
    // Filet : si controllerchange tarde, on recharge quand même.
    setTimeout(() => { if (!reloading) location.reload(); }, 3000);
  });
}

function watch(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    if (!nw) return;
    nw.addEventListener('statechange', () => {
      // Pas de contrôleur : premier install, rien à proposer.
      if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(nw);
    });
  });
}

export function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    if (!document.getElementById('update-bar')) return; // première prise de contrôle : pas de reload
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
    watch(reg);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('Service worker non enregistré', err));
}
