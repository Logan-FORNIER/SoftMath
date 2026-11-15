# SoftMath

**Application desktop de prise de notes mathématiques**, alliant rédaction Markdown temps réel, rendu LaTeX/KaTeX instantané, schémas interactifs, calcul symbolique/matriciel et copilote IA local ou cloud.

> Version actuelle : **`0.3.2`** · Basée sur **Tauri 2**, **React 19**, **TypeScript**, **TipTap 3**, **KaTeX**, **Excalidraw** et **Math.js**.

---

## Sommaire

- [Fonctionnalités principales](#fonctionnalités-principales)
  - [Éditeur Markdown & Mathématiques KaTeX](#éditeur-markdown--mathématiques-katex)
  - [Blocs interactifs & Visualisations](#blocs-interactifs--visualisations)
  - [Organisation, Connaissances & Révision](#organisation-connaissances--révision)
  - [Copilote IA & OCR mathématique](#copilote-ia--ocr-mathématique)
  - [Exports PDF / LaTeX & Recueil multi-notes](#exports-pdf--latex--recueil-multi-notes)
- [Commandes Slash (`/`)](#commandes-slash-)
- [Raccourcis clavier](#raccourcis-clavier)
- [Stack technique](#stack-technique)
- [Structure du projet](#structure-du-projet)
- [Développement & Compilation](#développement--compilation)
- [Mises à jour & Release CI](#mises-à-jour--release-ci)

---

## Fonctionnalités principales

### Éditeur Markdown & Mathématiques KaTeX
- **Formules en ligne (`$...$`) & blocs centrés (`$$...$$`)** : rendu KaTeX immédiat dès la fermeture des délimiteurs ou via `Ctrl+E` / `$$` + `Entrée`.
- **Numérotation & labels d'équations** : métadonnées natives `% softmath-eq: numbered label=eq:...` avec bascule de numérotation automatique dans le menu **Outils**.
- **Macros KaTeX personnalisables** : macros prédéfinies (`\R`, `\N`, `\Z`, `\Q`, `\C`, `\K`, `\eps`, `\ds`, `\ssi`, `\limn`, `\norm`) éditables dans les paramètres et automatiquement réutilisées à l'affichage comme à l'export `.tex`.
- **Palette & Constructeur de structures** : insertion rapide de symboles mathématiques, matrices, vecteurs et systèmes d'équations (`{cases}`), plus menu flottant sur sélection de texte.
- **Évaluateur mathématique instantané (`mathjs`)** : tapez `=` après une expression mathématique ou appuyez sur `Alt+=` pour insérer directement le résultat (arithmétique, complexes, matrices, dérivation/simplification symbolique).

### Blocs interactifs & Visualisations
Tous les blocs sont enregistrés en Markdown standard ou en blocs clôturés lisibles (`softmath-*`) :

- **Encadrés académiques repliables** (`:::definition`, `:::theorem`, `:::proof`, `:::example`, `:::exercise`) avec support du symbole CQFD (`□`) et compatibilité Mode Examen.
- **Dessins & Schémas Excalidraw** : croquis géométriques et diagrammes intégrés dans la note et sauvegardés localement dans un sous-dossier `.assets/` (`schema-*.excalidraw.json`).
- **Graphe de fonctions 2D** (`softmath-plot`) : courbes multiples $f(x)$, tracé de dérivée, paramètres dynamiques avec curseurs, tangente en $x_0$ et visualisation d'intégrale définie.
- **Tableaux de variations et de signes** (`softmath-variation`) : signes (`+`, `-`, `0`), valeurs interdites (`||`), limites à gauche/droite et sens de variation par flèches.
- **Matrices & Pivot de Gauss** (`softmath-matrix`) : arithmétique rationnelle exacte (`BigInt`) avec calcul du déterminant, de la trace, du rang, de l'inverse, mise sous forme échelonnée réduite (RREF) et résolution complète de systèmes $AX = B$ (solution unique, paramétrique ou incompatible) étape par étape.
- **Arbres de probabilités pondérés** (`softmath-proba`) : construction multi-niveaux, contrôle automatique de la somme des branches ($\Sigma = 1$), probabilités de chemins, loi des probabilités totales et formule de Bayes.
- **Surfaces 3D $z = f(x, y)$** (`softmath-3d`) : visualisation interactive rotative à la souris avec zoom, réglage de résolution et palettes (`indigo`, `heat`, `emerald`), incluant des préréglages (*onde*, *selle*, *paraboloïde*, *gaussienne*).
- **Géométrie analytique 2D** (`softmath-geometry`) : repère interactif avec points, segments, droites, vecteurs, cercles et mesures géométriques.

### Organisation, Connaissances & Révision
- **Espace de travail sur fichiers locaux `.md`** : arborescence complète (création, renommage, suppression de notes et dossiers) avec sauvegarde automatique et système d'onglets.
- **Vue scindée** : affichage simultané de deux notes côte à côte (ou lecture synchronisée de la même note).
- **Liens Wiki (`[[Note]]` / `[[Note|Libellé]]`)** : autocomplétion en tapant `[[`, aperçu au survol, ouverture en vue scindée (`Alt+Clic` / `Ctrl+Clic`), section **Rétroliens** dans le panneau plan et **Graphe de connaissances** interactif.
- **Mode Révision — Flashcards** (`Ctrl+Maj+R`) : extraction automatique des blocs `Définition`, `Théorème`, `Exercice` et `Exemple` du dossier ou de la note ouverte avec suivi local de progression (*À revoir*, *En cours*, *Maîtrisé*).
- **Mode Examen** (`Ctrl+Maj+E`) : masque instantanément les blocs `:::proof` et les sections de correction (`Correction`, `Corrigé`, `Solution`, `Éléments de réponse`) dans l'éditeur, l'impression PDF et les exports `.tex`.
- **Modèles de notes intégrés** (`Ctrl+Maj+N`) : *Fiche de cours structurée*, *Feuille de TD / Exercices*, *Sujet d'examen / Devoir surveillé*, *Étude de fonction complète* et *Fiche d'algèbre linéaire*.
- **Historique local (Snapshots)** (`Ctrl+Maj+H`) : conservation locale jusqu'à **25 instantanés par note** avec visualisation ligne par ligne des différences et restauration en un clic.
- **Recherche rapide plein texte** (`Ctrl+K` / `Ctrl+P`) : indexation insensible aux accents sur l'ensemble des notes du dossier ouvert.
- **Productivité & Confort** : minuteur **Pomodoro** (cycles 25 min / 5 min) dans la barre d'état, mode **Zen / sans distraction** (`F11` ou `Ctrl+Alt+Z`) et thème **clair / sombre**.

### Copilote IA & OCR mathématique
SoftMath intègre un assistant optionnel adapté aux mathématiques (aucune donnée envoyée sans configuration explicite) :
- **Fournisseurs pris en charge** :
  - **Local via Ollama** (`http://localhost:11434`, ex. `qwen2.5-math`).
  - **Google Gemini** (`gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`).
  - **Anthropic Claude** (`claude-sonnet-4-5-20250929`, `claude-3-7-sonnet-latest`, `claude-3-5-haiku-latest`).
- **Routage par profil** : `Auto`, `Local` ou `Cloud`.
- **Panneau Copilote & Actions IA inline (`Ctrl+I`)** : vérification de rigueur mathématique, audit de calcul ligne par ligne, développement d'étapes intermédiaires, génération d'exercices avec solution repliable, génération de blocs visuels et conversion LaTeX.
- **OCR mathématique** : transcription d'images (manuscrits, tableaux, captures) directement en Markdown + KaTeX.
- **Stockage local des clés API** : enregistré dans `ai-secrets.json` via le backend Rust Tauri (`app_local_data_dir`, droits `0600` sous Unix).

### Exports PDF / LaTeX & Recueil multi-notes
- **Export PDF** via mise en page d'impression dédiée (en thème clair pour une impression propre).
- **Export LaTeX (`.tex`)** ou **copie du code LaTeX** : conversion complète des formules, macros personnalisées, blocs académiques, matrices, tableaux de variations, arbres de probabilités, courbes 2D/3D et géométrie.
- **Recueil multi-notes** : sélection de plusieurs notes d'un espace de travail pour produire un document PDF ou `.tex` unifié (avec option d'exclusion des corrigés pour le Mode Examen).

---

## Commandes Slash (`/`)

Tapez `/` dans l'éditeur (ou utilisez le bouton `+` dans la marge gauche) pour insérer rapidement :

| Commande / Badge | Élément inséré |
| :--- | :--- |
| `/dessin` | Bloc de dessin / schéma **Excalidraw** |
| `$$` | Bloc mathématique LaTeX centré |
| `/graphe` | Graphe de fonction 2D interactif |
| `/tableau` | Tableau de variations et de signes |
| `/matrice` | Bloc Matrice & Pivot de Gauss |
| `/arbre` | Arbre de probabilités pondéré |
| `/3d` | Surface 3D $z = f(x, y)$ |
| `/geometrie` | Repère de géométrie analytique 2D |
| `/def`, `/theo`, `/preuve`, `/exemple`, `/exo` | Encadrés académiques repliables |
| `/pmatrix`, `/vecteur`, `/systeme` | Matrices, vecteurs colonnes et systèmes `{cases}` en LaTeX |
| `#`, `##`, `-`, `1.`, `>`, `` ``` `` | Titres, listes, citations et blocs de code |

---

## Raccourcis clavier

| Raccourci | Action |
| :--- | :--- |
| `Ctrl` + `E` | Insérer ou convertir la sélection en formule inline `$...$` |
| `$$` puis `Entrée` | Créer un bloc mathématique centré |
| `Alt` + `=` (ou `=` en fin d'expression) | Évaluer l'expression mathématique inline |
| `[[` | Ouvrir la complétion des liens Wiki entre notes |
| `/` | Ouvrir le menu de commandes slash |
| `Ctrl` + `I` | Ouvrir le menu d'actions IA sur la sélection / le curseur |
| `Ctrl` + `K` ou `Ctrl` + `P` | Recherche rapide dans le dossier |
| `Ctrl` + `N` | Créer une nouvelle note |
| `Ctrl` + `Maj` + `N` | Ouvrir les modèles de notes |
| `Ctrl` + `S` | Forcer la sauvegarde immédiate |
| `Ctrl` + `W` | Fermer l'onglet actif |
| `Ctrl` + `Tab` / `Ctrl` + `Maj` + `Tab` | Naviguer entre les onglets ouverts |
| `Ctrl` + `Maj` + `B` ou `Ctrl` + `\` | Afficher / masquer la barre latérale |
| `Ctrl` + `Maj` + `R` | Ouvrir le mode Révision (Flashcards) |
| `Ctrl` + `Maj` + `G` | Ouvrir le Graphe de connaissances |
| `Ctrl` + `Maj` + `H` | Ouvrir l'historique local (Snapshots) |
| `Ctrl` + `Maj` + `E` | Activer / désactiver le Mode Examen |
| `F11` ou `Ctrl` + `Alt` + `Z` | Mode Zen / sans distraction |

*(Sur macOS, remplacer `Ctrl` par `Cmd`.)*

---

## Stack technique

- **Shell Desktop** : [Tauri 2](https://v2.tauri.app/) (`tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-persisted-scope`, `tauri-plugin-http`, `tauri-plugin-process`, `tauri-plugin-updater`)
- **Frontend** : React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide Icons
- **Éditeur riche** : TipTap 3 (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/suggestion`), Floating UI
- **Mathématiques & Dessin** : KaTeX, Math.js, `@excalidraw/excalidraw`

---

## Structure du projet

```text
SoftMath/
├── .github/workflows/release.yml   # Workflow CI de build et release Tauri signée (Windows NSIS)
├── package.json                    # Scripts npm et dépendances frontend
├── src/
│   ├── App.tsx                     # Orchestration principale, raccourcis et modales
│   ├── components/                 # TopBar, TabBar, Sidebar, EditorArea, OutlinePanel, Modales…
│   ├── contexts/                   # SoftMathUiContext (macros KaTeX, Mode Examen, WikiLinks)
│   ├── editor/
│   │   ├── components/             # Vues React des nœuds TipTap, canevas 2D/3D, palettes & menus
│   │   ├── extensions/             # Extensions TipTap (Math, WikiLinks, SlashCommand, Blocs visuels…)
│   │   └── utils/                  # Évaluateur mathjs, snippets LaTeX, métadonnées d'équations
│   ├── hooks/                      # Gestion des onglets, workspace, thème, IA et updater
│   ├── services/                   # Services métier (FS, LaTeX, Exam, Backlinks, Matrix, Flashcards, IA…)
│   └── types/                      # Définitions TypeScript (notes, IA)
└── src-tauri/
    ├── Cargo.toml                  # Dépendances Rust Tauri
    ├── tauri.conf.json             # Configuration fenêtre, bundles et updater signé
    ├── capabilities/               # Permissions Tauri
    └── src/                        # Backend Rust (stockage sécurisé local des clés API IA)
```

---

## Développement & Compilation

### Prérequis
- **Node.js** (v24 recommandé, utilisé en CI) et **npm**
- **Rust** (toolchain stable via `rustup`) et les prérequis système Tauri 2 (sous Windows : WebView2 et Microsoft C++ Build Tools)

### Installation et lancement

```bash
# Installer les dépendances frontend
npm install

# Lancer uniquement le serveur frontend Vite (http://localhost:1420)
npm run dev

# Lancer l'application desktop complète (Tauri + Vite)
npm run tauri dev
```

### Vérification et builds

```bash
# Vérifier les types TypeScript
npm run typecheck

# Compiler le frontend de production (dist/)
npm run build

# Générer l'installeur Windows (.exe NSIS + artefacts updater)
npm run build:installer
```

---

## Mises à jour & Release CI

Le dépôt inclut [`.github/workflows/release.yml`](.github/workflows/release.yml), déclenché automatiquement lors du push d'un tag `v*` (par exemple `v0.3.2`).

- Compile l'application sous `windows-latest` via `tauri-apps/tauri-action@v0` (`--bundles nsis`).
- Signe les artefacts pour l'auto-updater (`tauri-plugin-updater`) à l'aide des secrets GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Publie la release et `latest.json` utilisés automatiquement par l'application pour vérifier et installer les nouvelles versions.
