#!/bin/sh
# Publie une nouvelle version sur GitHub Pages (branche gh-pages = contenu de public/).
# Usage : sh scripts/deploy.sh "message de version"
set -e
cd "$(dirname "$0")/.."
node scripts/build-precache.mjs
git add -A
git commit -m "${1:-Mise à jour}" || echo "Rien de nouveau à committer."
git push origin main
git push origin "$(git subtree split --prefix public main)":refs/heads/gh-pages --force
echo "Publié. L'iPhone proposera la mise à jour au prochain lancement de l'app."
