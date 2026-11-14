import {
  createPresetVariationConfig,
} from '../editor/extensions/SoftVariationTable';
import {
  parseFunctionPlotConfig,
} from '../editor/extensions/SoftFunctionPlot';

export type NoteTemplateId =
  | 'cours'
  | 'td'
  | 'examen'
  | 'etude-fonction'
  | 'algebre-lineaire';

export interface NoteTemplate {
  id: NoteTemplateId;
  title: string;
  suggestedFileName: string;
  category: string;
  description: string;
  content: string;
}

const SAMPLE_VARIATION_JSON = JSON.stringify(
  createPresetVariationConfig('quadratic'),
  null,
  2
);

const SAMPLE_PLOT_JSON = JSON.stringify(
  parseFunctionPlotConfig(
    JSON.stringify({
      title: 'Courbe représentative de f(x) = x^2 - 2x - 3',
      xMin: -4,
      xMax: 6,
      yMin: -6,
      yMax: 8,
      curves: [
        {
          id: 'c1',
          expression: 'x^2 - 2*x - 3',
          color: '#6366f1',
          visible: true,
          showDerivative: true,
        },
      ],
    })
  ),
  null,
  2
);

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'cours',
    title: 'Fiche de cours structurée',
    suggestedFileName: 'Cours',
    category: 'Cours',
    description: 'Plan de chapitre avec Définitions, Théorèmes, Preuves et Exemples.',
    content: `# Titre du chapitre

## 1. Définitions fondamentales

:::definition Définition principale
Soit $E$ un ensemble et $(u_n)_{n \\in \\N}$ une suite réelle. On dit que...
:::

## 2. Résultats et théorèmes clés

:::theorem Théorème central
Sous les hypothèses précédentes, on a :

$$
\\limn u_n = \\ell
$$
:::

:::proof Démonstration
Fixons $\\eps > 0$. Par définition de la limite...
:::

## 3. Applications directes

:::example Application immédiate
Calculer la limite de $u_n = \\frac{2n + 1}{n + 3}$ lorsque $n \\to +\\infty$.
:::
`,
  },
  {
    id: 'td',
    title: 'Feuille de TD / Exercices',
    suggestedFileName: 'TD Exercices',
    category: 'Entraînement',
    description: 'Série d’exercices progressifs avec démonstrations masquables en Mode Examen.',
    content: `# Feuille de TD — Exercices d'entraînement

:::exercise Exercice 1 — Application directe
Soit $f : \\R \\to \\R$ définie par $f(x) = x^2 - 2x - 3$.

1. Déterminer les racines de $f$.
2. Dresser le tableau de variations de $f$.
:::

:::proof Correction — Exercice 1
Le discriminant vaut $\\Delta = (-2)^2 - 4(1)(-3) = 16 > 0$, d'où $x_1 = -1$ et $x_2 = 3$.
:::

:::exercise Exercice 2 — Approfondissement
Montrer que pour tout $n \\in \\N^*$, $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$.
:::

---

## Correction détaillée

:::proof Par récurrence
- **Initialisation** ($n=1$) : $1 = \\frac{1 \\times 2}{2}$, vrai.
- **Hérédité** : Supposons la propriété vraie au rang $n$, alors $\\sum_{k=1}^{n+1} k = \\frac{n(n+1)}{2} + (n+1) = \\frac{(n+1)(n+2)}{2}$.
:::
`,
  },
  {
    id: 'examen',
    title: 'Sujet d’examen / Devoir surveillé',
    suggestedFileName: 'Sujet Examen',
    category: 'Évaluation',
    description: 'En-tête officiel (durée, barème), problèmes et section Correction compatible Mode Examen.',
    content: `# Devoir Surveillé — Mathématiques

> **Durée :** 2 h 00 · **Calculatrice :** Non autorisée · **Barème indicatif :** 20 points

## Problème 1 — Analyse réelle (10 pts)

:::exercise Exercice 1 (4 pts)
Soit $f(x) = \\ln(1 + x^2)$ définie sur $\\R$.

1. Étudier la parité et la dérivabilité de $f$ sur $\\R$.
2. Calculer $f'(x)$ et étudier ses variations.
:::

## Problème 2 — Algèbre / Probabilités (10 pts)

:::exercise Exercice 2 (6 pts)
Déterminer les solutions du système linéaire associé à la matrice du cours.
:::

---

## Corrigé et barème

:::proof Éléments de correction
1. $f$ est paire car $f(-x) = \\ln(1 + (-x)^2) = f(x)$, et $C^\\infty(\\R)$.
2. $f'(x) = \\frac{2x}{1+x^2}$, du signe de $x$.
:::
`,
  },
  {
    id: 'etude-fonction',
    title: 'Étude de fonction complète',
    suggestedFileName: 'Etude de fonction',
    category: 'Analyse',
    description: 'Domaine, dérivée, tableau de variations interactif et courbe 2D pré-remplis.',
    content: `# Étude de la fonction $f(x) = x^2 - 2x - 3$

## 1. Ensemble de définition et parité

La fonction polynôme $f$ est définie et dérivable sur $\\mathcal{D}_f = \\R$.

## 2. Dérivée et sens de variation

Pour tout $x \\in \\R$, on a :

$$
f'(x) = 2x - 2 = 2(x - 1)
$$

\`\`\`softmath-variation
${SAMPLE_VARIATION_JSON}
\`\`\`

## 3. Représentation graphique

\`\`\`softmath-plot
${SAMPLE_PLOT_JSON}
\`\`\`
`,
  },
  {
    id: 'algebre-lineaire',
    title: 'Fiche d’algèbre linéaire',
    suggestedFileName: 'Algebre lineaire',
    category: 'Algèbre',
    description: 'Espaces vectoriels, applications linéaires et bloc Matrice / Pivot de Gauss prêt à éditer.',
    content: `# Espaces vectoriels & Matrices

:::definition Sous-espace vectoriel
Une partie $F$ d’un $\\K$-espace vectoriel $E$ est un sous-espace vectoriel si $0_E \\in F$ et pour tous $\\lambda \\in \\K$ et $u, v \\in F$, $\\lambda u + v \\in F$.
:::

## Calcul matriciel et résolution de systèmes

\`\`\`softmath-matrix
{
  "title": "Système linéaire AX = B",
  "mode": "system",
  "delimiter": "pmatrix",
  "rows": 3,
  "cols": 3,
  "entries": [
    ["2", "1", "-1"],
    ["-3", "-1", "2"],
    ["-2", "1", "2"]
  ],
  "rhs": ["8", "-11", "-3"],
  "showSteps": false
}
\`\`\`
`,
  },
];

export function getNoteTemplateById(id: NoteTemplateId): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}

