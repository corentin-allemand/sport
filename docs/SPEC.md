# Sport : app de suivi d'entraînement

App web perso, mobile first, pour suivre un programme de 13 semaines (ski fin février, moto piste et 4h de Carole au printemps).
Source du programme : une page Notion perso.

## Principes non négociables

- **Zéro dépendance.** Node 24, modules natifs uniquement (`node:http`, `node:fs`, `node:path`, `node:crypto`). Pas de `package.json` de deps, pas de npm install, pas de build, pas de framework, pas de bundler.
- **Front vanilla** : `public/index.html`, `public/styles.css`, `public/app.js` (ES modules autorisés, plusieurs fichiers JS OK dans `public/js/`). Hash routing.
- **Base de données = fichiers JSON** dans `data/`. Le programme est de la donnée, jamais du code : on doit pouvoir changer un exercice, une prescription, une date de début sans toucher au JS.
- Tout le texte de l'UI en **français accentué**. **Aucun tiret cadratin ou demi-cadratin** nulle part, ni dans le code ni dans les données : utiliser virgule, deux-points, parenthèses ou tiret simple.
- Lancement : `node server.js` → http://localhost:4321, écoute sur `0.0.0.0` (accès depuis le téléphone sur le même wifi).

## Arborescence

```
server.js
data/db.json        programme + journal (seul fichier écrit par le serveur)
data/media.json     médias par exercice (lu seulement)
public/index.html
public/styles.css
public/app.js       (+ public/js/*.js si besoin)
docs/SPEC.md
README.md
```

## Schéma `data/db.json`

```jsonc
{
  "meta": { "version": 1 },
  "program": {
    "id": "ski-moto-2026",
    "name": "Ski + moto piste",
    "startDate": "2026-10-12",            // lundi de S1, ISO
    "weeks": 13,
    "schedule": { "A": 1, "B": 3, "C": 5 }, // jour ISO de la semaine (1 = lundi ... 7 = dimanche)
    "goals": [ { "title": "Ski (fin février / début mars)", "text": "..." } ],
    "rules": [ { "title": "Charges au RPE", "text": "..." } ],
    "phases": [
      { "id": "p1", "name": "Fondation", "weeks": [1,2,3,4], "description": "..." },
      { "id": "p2", "name": "Force", "weeks": [5,6,7,8], "description": "..." },
      { "id": "p3", "name": "Puissance", "weeks": [9,10,11,12], "description": "..." },
      { "id": "p4", "name": "Tests et bilan", "weeks": [13], "description": "..." }
    ],
    "testWeeks": [1,5,9,13]
  },
  "exercises": [
    {
      "id": "back-squat",                 // kebab-case, stable
      "name": "Back squat",
      "aka": "ou goblet squat",           // optionnel
      "muscles": ["Quadriceps", "Fessiers"],
      "description": "Comment le faire, 1 à 3 phrases.",
      "cues": ["Descente contrôlée 3 s", "Genoux dans l'axe des pieds"],
      "equipment": "Barre"                // ou "Poids du corps", "Haltères", etc.
    }
  ],
  "sessions": [
    {
      "id": "A",                          // A, B, C (salle), HA, HB, HC (maison)
      "kind": "gym",                      // "gym" | "home"
      "homeOf": null,                     // pour HA: "A", etc.
      "name": "Jambes, spécial ski",
      "duration": "60 min",
      "intro": "texte court optionnel",
      "blocks": [
        {
          "title": "Force",               // ex: "Bloc 1, force explosive (20 min)"
          "note": "optionnel",
          "items": [
            {
              "exerciseId": "back-squat",
              "prescription": { "p1": "3 x 10", "p2": "4 x 6", "p3": "4 x 5 + 3 squat jumps", "p4": "3 x 10" },
              "note": "Descente contrôlée 3 s"
            }
          ]
        }
      ]
    }
  ],
  "tests": [
    { "id": "wall-sit", "name": "Chaise contre le mur", "unit": "s", "better": "higher", "exerciseId": "wall-sit" }
  ],
  "glossary": [ { "term": "RPE", "text": "..." } ],

  "logs": [
    // écrit par l'app
    { "id": "uuid", "date": "2026-10-12", "sessionId": "A", "variant": "gym", "status": "done", "rpe": 7, "note": "", "createdAt": "ISO" }
  ],
  "testResults": [
    { "id": "uuid", "week": 1, "testId": "wall-sit", "value": 95, "date": "2026-10-12", "createdAt": "ISO" }
  ]
}
```

Règles de prescription :
- `prescription` porte une clé par phase (`p1`..`p4`). S13 (`p4`) : reprendre la prescription `p1` sauf mention contraire.
- Séances maison : la prescription tient dans un champ par item (identique pour toutes les phases), le nombre de tours par phase est dans `block.note` ou dans une clé `rounds: { "p1": 3, "p2": 4, "p3": 4, "p4": 3 }` au niveau du bloc.

## Schéma `data/media.json`

```jsonc
{
  "back-squat": {
    "images": ["https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
               "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/1.jpg"],
    "video": "https://www.youtube.com/results?search_query=back+squat+technique"
  }
}
```
- `images` : 2 images (position de départ / d'arrivée) que le front alterne toutes les 700 ms pour faire une animation type GIF. Peut être vide si aucune correspondance fiable.
- `video` : toujours présent. Lien de recherche YouTube ciblé (pas d'ID de vidéo inventé).

## API (server.js)

| Méthode | Route | Effet |
| --- | --- | --- |
| GET | `/api/db` | renvoie `db.json` avec chaque exercice enrichi de `media` (depuis media.json) |
| POST | `/api/logs` | body `{date, sessionId, variant, status, rpe?, note?}` ; si un log existe déjà pour (date, sessionId) il est remplacé ; renvoie le log |
| DELETE | `/api/logs/:id` | supprime un log |
| POST | `/api/tests` | body `{week, testId, value, date?}` ; remplace si (week, testId) existe |
| DELETE | `/api/tests/:id` | supprime un résultat |
| GET | `/api/calendar.ics` | calendrier iCal de toutes les séances planifiées (13 semaines), à 7h00 heure de Paris, avec alarme 1h avant, pour les rappels dans le calendrier du téléphone |
| GET | `/*` | fichiers statiques de `public/`, `index.html` par défaut |

- Écriture atomique : écrire `db.json.tmp` puis `rename`. Sérialiser les écritures (file d'attente) pour éviter les courses.
- Validation simple des bodies (types, champs requis), réponses JSON, codes 400/404 propres.
- Pas de cache sur `/api/*`.

## Logique métier (front)

- Semaine courante = `floor((aujourd'hui - startDate) / 7) + 1`, bornée à [1, weeks]. Avant le début : afficher le compte à rebours.
- Phase courante = phase dont `weeks` contient la semaine courante.
- Date planifiée d'une séance = startDate + (semaine-1)*7 + (schedule[id]-1) jours.
- Statut d'une séance planifiée :
  - `done` si un log `status: "done"` existe pour cette date planifiée et cet id (variant gym ou home).
  - `skipped` si log `status: "skipped"`.
  - `today` si date = aujourd'hui et pas de log.
  - `missed` si date passée sans log.
  - `upcoming` sinon.
- Une séance faite un autre jour que prévu : le log garde la date planifiée (le bouton "fait" logue la date planifiée de la séance consultée).

## Écrans

Barre d'onglets en bas (3 onglets) : **Aujourd'hui**, **Séances**, **Suivi**.

1. **Aujourd'hui** (`#/`) : semaine Sx / 13 + phase, carte héro de la séance du jour (ou prochaine séance + "dans N jours"), bouton pour l'ouvrir, rappel des séances manquées de la semaine, mini-progression de la semaine (3 pastilles A/B/C), bandeau "semaine de tests" si S1/S5/S9/S13. Lien "Ajouter à mon calendrier" (`/api/calendar.ics`).
2. **Séances** (`#/seances`) : liste par semaine (semaine courante dépliée et en haut ou scroll auto), chaque séance avec statut (fait / manquée / aujourd'hui / à venir / sautée). Tap → détail.
3. **Détail séance** (`#/seance/:week/:sessionId`) : nom, date, phase, bascule **Salle / Maison**, blocs et exercices avec la prescription de la phase de cette semaine, tap sur un exercice → détail exercice. En bas : "Marquer comme faite" (choix RPE 1 à 10 + note facultative), "Sauter", ou "Annuler" si déjà loguée.
4. **Détail exercice** (`#/exercice/:id`) : animation (alternance des 2 images), nom, muscles, description, points clés, matériel, bouton "Voir en vidéo". Si pas d'image : visuel de remplacement élégant (icône + nom).
5. **Suivi** (`#/suivi`) : % de séances faites sur les semaines écoulées, série en cours, graphique simple (SVG fait main) séances faites par semaine, tableau des tests (lignes = tests, colonnes = S1/S5/S9/S13) avec saisie et delta vs S1, RPE moyen. Accès aux objectifs, règles et glossaire (sections repliables).

## Design

Glassmorphisme sport, beau, minimal, épuré, mobile first (cible 390 px de large, reste propre jusqu'au desktop en colonne centrée max 480 px).
- Fond sombre profond avec 2 ou 3 halos dégradés flous et lents (lime électrique, cyan, violet).
- Cartes en verre dépoli : `backdrop-filter: blur()`, bordure 1px blanche à faible opacité, ombre douce, rayons généreux.
- Une couleur d'accent énergique (lime/néon) pour les actions et l'état "aujourd'hui". Statuts lisibles : fait (accent), manquée (corail doux), à venir (neutre).
- Typo : une seule famille moderne et sportive (Google Fonts autorisé, ex. "Inter Tight" ou "Space Grotesk"), chiffres tabulaires, gros chiffres pour les métriques.
- Icônes en SVG inline, pas de librairie.
- Micro-animations sobres (transitions de vue, pression des boutons), `prefers-reduced-motion` respecté.
- Zones tactiles >= 44 px, safe-area iOS (`env(safe-area-inset-*)`), `meta viewport` + `theme-color`, ajout à l'écran d'accueil (manifest minimal + icône SVG).

---

# V2 : bibliothèque, configuration, alternatives, animations

## Données (ajouts à `data/db.json`)

```jsonc
{
  "muscleGroups": [ { "id": "quadriceps", "name": "Quadriceps" } ],   // taxonomie des catégories
  "exercises": [ { "...": "...", "group": "quadriceps" } ],          // group = catégorie principale, obligatoire
  "preferences": {
    "swaps": { "A/back-squat": "goblet-squat" }   // clé "<sessionId>/<exerciseId d'origine>" -> exercice de remplacement
  }
}
```

- **Alternatives** : pour un exercice, ce sont tous les autres exercices de la bibliothèque qui ont le même `group`. Règle de données : chaque groupe contient au moins 2 exercices, donc chaque exercice a au moins une alternative.
- **Switch** : choisir une alternative pour un item de séance écrit `preferences.swaps["<sessionId>/<exerciseId>"]`. Le remplacement s'applique à toutes les phases de cette séance. La prescription reste celle de l'item d'origine. Remettre l'original supprime la clé.
- **Animation** : `data/media.json` peut contenir `"animation": "media/<id>.mp4"` (fichier dans `public/media/`). Priorité d'affichage : animation > images > visuel de remplacement.

## API (ajouts)

| Méthode | Route | Effet |
| --- | --- | --- |
| PUT | `/api/config` | body `{program, exercises, sessions, tests, glossary, muscleGroups}`. Valide l'intégrité (ids uniques, tout `exerciseId` des sessions et tests existe, tout `group` existe dans `muscleGroups`, `program.schedule` couvre les séances "gym"). Sauvegarde l'état précédent dans `data/backups/db-<horodatage>.json` (garder les 20 derniers), puis écrit. Ne touche jamais `logs`, `testResults`, `preferences`, sauf pour retirer des `swaps` devenus invalides. Renvoie la db complète enrichie. 400 avec liste d'erreurs sinon. |
| PUT | `/api/preferences/swaps` | body `{sessionId, exerciseId, replacementId}` ; `replacementId: null` supprime le swap. Vérifie que les deux exercices existent et ont le même `group`. |
| GET | `/media/*` | fichiers de `public/media/` avec support **Range** (réponses 206, `Accept-Ranges: bytes`), obligatoire pour la lecture vidéo sur Safari iOS. Type `video/mp4`. |

## Écrans (ajouts)

Barre d'onglets à 4 : **Aujourd'hui**, **Séances**, **Exercices** (bibliothèque), **Suivi**. Accès à la configuration par une icône réglages en haut à droite des écrans Aujourd'hui et Suivi.

1. **Bibliothèque** (`#/exercices`) : recherche plein texte (nom, aka, muscles), filtres en pastilles par groupe musculaire, liste de cartes (vignette : première image de l'animation ou image, nom, groupe). Tap → détail exercice.
2. **Détail exercice** : l'animation MP4 en héro (`<video autoplay loop muted playsinline>`, poster = première image si dispo). Section "Alternatives" (même groupe), chaque alternative cliquable.
3. **Détail séance** : chaque exercice affiche un bouton "switch" (icône deux flèches). Il ouvre une feuille avec l'exercice d'origine et ses alternatives (même groupe), l'exercice actif coché. Choisir une alternative enregistre le swap immédiatement. Un exercice remplacé affiche discrètement "remplace : <nom d'origine>".
4. **Configuration** (`#/config`), éditeur de la base programme, simple et lisible :
   - Programme : date de début, jour de la semaine de chaque séance salle.
   - Séances : choisir une séance, voir ses blocs, pour chaque item changer l'exercice (sélecteur issu de la bibliothèque, filtrable), modifier la prescription p1 à p4 et la note, ajouter, supprimer, monter, descendre un item.
   - Exercices : liste, édition (nom, aka, groupe, muscles, description, points clés, matériel), ajout d'un nouvel exercice, suppression seulement s'il n'est utilisé nulle part.
   - Groupes musculaires : ajouter, renommer.
   - Un seul bouton "Enregistrer" (barre collante en bas quand il y a des modifications), qui envoie `PUT /api/config`. Erreurs de validation affichées clairement. Bouton "Annuler les modifications".
5. **Suivi, tests** : aucune restriction de saisie. On peut renseigner ou modifier un résultat pour n'importe quelle semaine de test, passée ou future.

---

# V3 : PWA local-first, sans serveur

L'app devient une PWA installable sur iPhone qui tourne entièrement sur l'appareil. Cette section remplace l'API, `data/` et le serveur décrits plus haut ; écrans, design et règles métier ne changent pas.

## Architecture

- **Hébergement** : `public/` en statique (https), chemins tous relatifs (sous-dossier possible). `server.js` n'est plus qu'un serveur statique de dev (Range, MIME, protection path traversal), sans `/api`.
- **Graine** : `public/data/program.json` = config de base (`program`, `exercises`, `sessions`, `tests`, `glossary`, `muscleGroups`) + `"programVersion"` à la racine, sans journal. `public/data/media.json` = images par exercice, lu à chaque chargement, jamais stocké.
- **Store** (`public/js/store.js`) : base IndexedDB `sport`, magasin `kv`, clés `db` (db complète : config + `logs` + `testResults` + `preferences` + `programVersion` + `configEditedAt`), `meta` (`firstRunAt`, `lastExportAt`, `persistAsked`) et `history` (10 dernières configs). Repli localStorage si IndexedDB est indisponible. Même interface que l'ancienne API (`db`, `saveLog`, `deleteLog`, `saveTest`, `deleteTest`, `saveSwap`, `saveConfig`) et mêmes règles : remplacement sur (date, sessionId) et (week, testId), validation d'intégrité de la config (mêmes messages), swaps limités au même groupe, nettoyage des swaps invalides, `crypto.randomUUID`. Écritures sérialisées.
- **Premier lancement** : db locale créée depuis la graine (journal vide, `preferences.swaps` vide), demande de `navigator.storage.persist()`.
- **Mise à jour du programme** : si `programVersion` de la graine est supérieure à la version locale : remplacement de la config si `configEditedAt` est absent, sinon fusion par id (nouveaux exercices, groupes, tests, termes du glossaire ; séances et exercices existants intacts) et toast unique « Programme mis à jour, tes modifications sont conservées ». `logs`, `testResults` et `preferences` ne sont jamais écrasés.
- **Configuration, onglet Données** : export `sport-backup-AAAA-MM-JJ.json` (db complète), import validé avec confirmation (remplace la db), date du dernier export, « Réinitialiser le programme » (graine actuelle, journal conservé), « Restaurer la configuration précédente ». Rappel discret sur Aujourd'hui après 30 jours sans export.
- **Calendrier** : `.ics` généré côté client (`public/js/ics.js`, même format que l'ancien serveur : VTIMEZONE Europe/Paris, CRLF, pliage 75 octets, UID stables, 7h00, VALARM -PT1H), proposé en Blob `text/calendar`.

## Hors ligne (`public/sw.js`)

- `scripts/build-precache.mjs` (Node, zéro dépendance) liste tous les fichiers de `public/` dans `public/precache.json`, vérifie que chaque image de `media.json` existe, calcule `version` = hash du contenu et l'écrit dans `sw.js` (le fichier change, donc le navigateur voit la mise à jour).
- Installation : précache de toute la liste dans `sport-<version>`. Activation : suppression des anciens caches `sport-*`.
- Stratégies : réseau d'abord avec repli cache pour `index.html` (et toute navigation), `data/program.json`, `data/media.json`, `precache.json` ; cache d'abord pour le reste. Google Fonts en cache à l'exécution (`sport-fonts`), police système en repli.
- Nouvelle version prête : bandeau « Nouvelle version », bouton « Mettre à jour » (skipWaiting puis rechargement). Enregistrement seulement en contexte sécurisé (https ou localhost).

## iOS

Manifest (`short_name` « Sport », `display: standalone`, `start_url` et `scope` « ./ », couleurs sombres, icônes PNG 180, 192, 512 et maskable 512), `apple-touch-icon` 180, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title`.
