# Sport

App de suivi d'entraînement, 13 semaines. Application web installable (PWA) qui tourne entièrement sur le téléphone : pas de serveur, pas de compte, fonctionne hors ligne. Aucune dépendance à installer.

## Installer sur l'iPhone

1. Publier le dossier `public/` sur un hébergement statique en **https** (GitHub Pages, Netlify, Cloudflare Pages...). L'app peut vivre dans un sous-dossier, tous les chemins sont relatifs.
2. Ouvrir l'URL https dans **Safari**.
3. Bouton Partager, puis « Sur l'écran d'accueil ».

Au premier lancement, l'app télécharge le programme et toutes les images, puis n'a plus besoin du réseau.

Android (Chrome) : menu ⋮, puis « Installer l'application ».

## Où sont mes données ?

Sur le téléphone, dans le stockage du navigateur (IndexedDB) : séances faites, RPE, notes, tests, remplacements d'exercices et configuration du programme. Rien ne part sur un serveur. L'app demande au navigateur un stockage persistant pour éviter qu'il ne soit vidé.

Conséquence : supprimer l'app de l'écran d'accueil ou effacer les données de Safari efface aussi le journal. D'où la sauvegarde.

## Sauvegarde

Configuration (icône réglages), onglet **Données** :

- **Exporter mes données** : télécharge `sport-backup-AAAA-MM-JJ.json` (programme, journal, préférences). Le ranger dans iCloud Drive ou Fichiers.
- **Importer une sauvegarde** : choisir un fichier exporté, confirmer. Remplace toutes les données du téléphone.
- La date du dernier export est affichée. Un rappel discret apparaît sur Aujourd'hui après 30 jours sans export.

Même onglet : « Réinitialiser le programme » remet le programme d'origine sans toucher au journal, et « Restaurer la configuration précédente » annule le dernier enregistrement (10 versions gardées sur l'appareil).

## Calendrier

Aujourd'hui, « Ajouter à mon calendrier » : l'app génère un fichier `.ics` avec toutes les séances (7h00, rappel une heure avant). Sur iPhone, Safari propose directement de les ajouter à Calendrier. Après un changement de jours ou de date de début, refaire l'ajout : les événements gardent le même identifiant.

## Mettre à jour l'app ou le programme

1. Modifier les fichiers dans `public/` (code, `public/data/program.json` pour le programme, `public/data/media.json` et `public/media/images/` pour les images).
2. Si le programme change, incrémenter `programVersion` à la racine de `program.json`.
3. Lancer `node scripts/build-precache.mjs` (liste des fichiers hors ligne et nouvelle version du service worker).
4. Redéployer `public/`.

Sur le téléphone, un bandeau « Nouvelle version » apparaît : « Mettre à jour » recharge l'app. Pour le programme : si la configuration n'a jamais été modifiée dans l'app, elle est remplacée par la nouvelle ; sinon les nouveaux exercices, groupes, tests et termes du glossaire sont ajoutés, et les séances et exercices existants ne bougent pas. Le journal n'est jamais touché.

## Dev local

Il faut Node 24 ou plus récent.

```
node scripts/build-precache.mjs
node server.js
```

`server.js` sert `public/` en statique (http://localhost:4321, `PORT=8080 node server.js` pour changer de port). Le service worker ne s'active qu'en contexte sécurisé : `localhost` convient, mais l'adresse réseau `http://192.168...` affichée ne permet pas l'installation hors ligne sur le téléphone (il faut du https).

## Arborescence

```
public/index.html, styles.css, app.js, js/*.js   app (ES modules, sans build)
public/js/store.js        données locales (IndexedDB, repli localStorage)
public/sw.js              service worker (hors ligne, mises à jour)
public/precache.json      généré par scripts/build-precache.mjs
public/data/program.json  programme de base (graine)
public/data/media.json    images par exercice
public/media/images/      images locales
server.js                 serveur statique de dev
```

## Ancien journal (version serveur)

Le journal de l'ancienne version (fichier `data/db.json`) est conservé au format d'import dans `data/backups/` (non versionné). Pour le récupérer : Configuration, Données, Importer une sauvegarde.
