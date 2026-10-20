# Cartes — flashcards de prépa (maths, physique, info, SI)

Une app noir et blanc pour iPhone (et Mac) : **rien à installer, aucun serveur**.
Tes cartes restent dans ton navigateur ; une sauvegarde par fichier les protège.

## Comment c'est organisé

* **4 onglets de matière** : Maths, Physique, Info, SI.
* **Catégories** dans chaque matière
  * Maths et Physique : Exos, Définitions (définitions + théorèmes), Démos, Erreurs
  * SI : Exos, Définitions, Démos
  * Info : Code (exo au recto, code au verso), Définitions
* **Paquets** : c'est toi qui les crées dans une catégorie (ex. « Arithmétique », « Groupes »).
  Un paquet peut être **important** (il revient plus souvent) ou **en pause** (il n'apparaît plus).
* **Cartes** : recto / verso, chacun avec du texte, des formules LaTeX (`$x^2$`, `$$\int_0^1 f$$`),
  du code (entre ```), et **une image** (qui reçoit un fond blanc).
  Étoiles de difficulté (1 à 3) sur les exos et le code. Tags libres (ex. « colle X, DS Henri 4 »).

## Réviser

* **Réviser** : les cartes dues aujourd'hui. Après avoir retourné la carte : *Raté* (revient dans 10 min),
  *Bien* ou *Facile* (prochaine date affichée sur le bouton : demain, 3 j, 1 sem…).
  Les paquets importants reviennent environ 40 % plus tôt.
* **Tout revoir** : toutes les cartes du paquet, sans tenir compte des dates (avant un DS).
* **Définitions seulement** : **Associer** (12 tuiles, 3 colonnes × 4 lignes, sans chrono)
  et **QCM** (4 réponses, sans chrono).
* Le filtre de tag d'un paquet s'applique aux révisions de ce paquet.

## Sauvegarde (important)

Réglages → **Exporter mes cartes** : un fichier `.json` avec tout (images comprises).
Garde-le dans Fichiers / iCloud. **Importer** fusionne ou remplace. L'app te rappelle de sauvegarder
si tu ne l'as pas fait depuis 7 jours. Sur iPhone : Partager → « Sur l'écran d'accueil » rend les données plus sûres.

## Mettre l'app en ligne (GitHub Pages)

1. Sur github.com : **New repository**, nom `cartes`, public, **Create**.
2. **uploading an existing file** : glisse **tout le contenu** du dossier (pas le dossier lui-même) :
   `index.html`, `app.js`, `logique.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/`.
   Commit.
3. **Settings → Pages → Branch : main, dossier / (root) → Save.**
4. Après 1 à 2 minutes : `https://mathematicien100frontieres.github.io/cartes/` — ouvre sur iPhone,
   puis Partager → « Sur l'écran d'accueil ».

## Changer l'organisation

Tout est au début de `logique.js` (`CATEGORIES` et `MATIERES`) : noms, catégories par matière,
étoiles ou non, modes de révision.

## Tests

```
node tests/test_logique.js        # 80 vérifications de la logique
python tests/e2e.py [dossier]     # parcours complet dans un vrai navigateur (Playwright + Chromium)
```
KaTeX 0.16.11 (licence MIT) est fourni dans `vendor/katex/` : les formules marchent hors ligne.
