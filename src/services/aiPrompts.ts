import type { AiInlineActionKind } from '../types/ai';
import { parseMatrixBlockConfig } from '../editor/extensions/SoftMatrixBlock';
import { parseFunctionPlotConfig } from '../editor/extensions/SoftFunctionPlot';
import { parseProbabilityTreeConfig } from '../editor/extensions/SoftProbabilityTree';
import { parseVariationTableConfig } from '../editor/extensions/SoftVariationTable';

export const DEFAULT_AI_SYSTEM_PROMPT = `Tu es un enseignant-chercheur en mathématiques de haut niveau (classes préparatoires, université, école d'ingénieur).

Règles strictes de rédaction et de formatage :
1. Rigueur absolue : vérifie systématiquement les domaines de définition, conditions d'application des théorèmes, hypothèses de continuité/dérivabilité/convergence, quantificateurs et cas limites.
2. Syntaxe mathématique KaTeX OBLIGATOIRE :
   - Formules en ligne uniquement avec des dollars simples : $...$ (exemple : $x \\in \\mathbb{R}$). N'utilise JAMAIS \\(...\\).
   - Formules centrées en bloc uniquement avec des doubles dollars sur des lignes dédiées :
     $$
     ...
     $$
     N'utilise JAMAIS \\[...\\].
3. Structure claire en Markdown : titres hiérarchisés, étapes numérotées et concises, réponses en français.`;

export const MATH_OCR_SYSTEM_PROMPT = `Tu es un moteur expert d'OCR mathématique (manuscrit, tableau blanc, manuel, PDF).

Transcris fidèlement le contenu mathématique et textuel de l'image en Markdown + LaTeX pur compatible KaTeX.
Règles strictes :
- Formules en ligne uniquement entre $...$ (jamais \\(...\\)).
- Formules centrées en bloc uniquement entre $$ sur des lignes dédiées (jamais \\[...\\]).
- Reproduis matrices, vecteurs et systèmes avec \\begin{pmatrix}...\\end{pmatrix} ou \\begin{cases}...\\end{cases}.
- N'ajoute AUCUN commentaire, AUCUNE phrase d'introduction ni bloc de code englobant \`\`\`markdown.`;

export function buildContextualSystemPrompt(
  basePrompt: string,
  noteTitle?: string | null,
  noteMarkdown?: string | null
): string {
  const cleanBase = basePrompt.trim() || DEFAULT_AI_SYSTEM_PROMPT;
  if (!noteMarkdown || !noteMarkdown.trim()) {
    return cleanBase;
  }

  const maxChars = 14000;
  const trimmedMd = noteMarkdown.trim();
  const truncated =
    trimmedMd.length > maxChars
      ? `${trimmedMd.slice(0, maxChars)}\n\n[... chapitre tronqué pour respecter la fenêtre contextuelle ...]`
      : trimmedMd;

  return `${cleanBase}

---
CONTEXTE ACTUEL DE LA NOTE OUVERTE (${noteTitle || 'Sans titre'}) :
\`\`\`markdown
${truncated}
\`\`\`
Utilise ce chapitre comme référence de notations, définitions et théorèmes déjà posés.`;
}

export function buildInlineActionPrompts(
  action: AiInlineActionKind,
  targetText: string,
  surroundingText: string
): { userPrompt: string; actionPromptOverride?: string } {
  const contextNote =
    surroundingText && surroundingText !== targetText
      ? `\n\nContexte immédiat autour de l'extrait :\n\`\`\`markdown\n${surroundingText.slice(0, 2500)}\n\`\`\``
      : '';

  switch (action) {
    case 'verify-rigor':
      return {
        userPrompt: `Analyse la rigueur mathématique de l'extrait suivant. Détecte précisément :\n- les erreurs de calcul ou de signe ;\n- les domaines de définition, divisions par zéro ou valeurs interdites manquantes ;\n- les hypothèses omises (continuité, dérivabilité, convergence, quantificateurs) ou sauts logiques.\nSois synthétique, constructif et propose une formulation corrigée si nécessaire.\n\nExtrait :\n\`\`\`markdown\n${targetText}\n\`\`\`${contextNote}`,
      };

    case 'verify-calculation':
      return {
        userPrompt: `Effectue un audit ligne par ligne des calculs algébriques suivants. Vérifie chaque égalité ou implication successive (signes, développements, fractions, dérivées, primitives, bornes, changements de variable). Indique explicitement si le calcul est exact ou pointe la ligne exacte où une erreur apparaît et donne la correction exacte en KaTeX.\n\nCalcul à auditer :\n\`\`\`markdown\n${targetText}\n\`\`\`${contextNote}`,
      };

    case 'detail-steps':
      return {
        actionPromptOverride:
          DEFAULT_AI_SYSTEM_PROMPT +
          '\nRéponds uniquement avec le Markdown détaillant les étapes intermédiaires en KaTeX ($...$ / $$...$$), sans phrase d’introduction ni bloc ```markdown.',
        userPrompt: `Développe proprement toutes les étapes intermédiaires du calcul ou raisonnement suivant en LaTeX clair et rigoureux :\n\n${targetText}${contextNote}`,
      };

    case 'generate-exercise':
      return {
        actionPromptOverride:
          DEFAULT_AI_SYSTEM_PROMPT +
          `\nGénère UNIQUEMENT un bloc Markdown SoftMath en utilisant exactement cette structure sans texte autour :\n:::exercise Exercice d'application\nÉnoncé clair avec formules KaTeX ($...$ / $$...$$).\n:::\n\n:::proof{collapsed} Solution détaillée\nRédaction rigoureuse de la solution étape par étape.\n:::`,
        userPrompt: `À partir du théorème ou passage suivant, génère un exercice d'application pertinent (niveau universitaire / prépa) accompagné de sa solution repliable :\n\n${targetText}${contextNote}`,
      };

    case 'generate-visual':
      return {
        actionPromptOverride:
          `Tu es un générateur de schémas mathématiques JSON pour SoftMath.\nRéponds UNIQUEMENT par un bloc Markdown clôturé \`\`\`softmath-variation OU \`\`\`softmath-plot (pas d'explication autour).\n\nFormat tableau de variations (\`\`\`softmath-variation) :\n{"title":"Titre","variable":"x","xValues":["-\\\\infty","0","+\\\\infty"],"rows":[{"id":"r1","kind":"sign","label":"f'(x)","signs":["-","+"],"markers":["","0",""]},{"id":"r2","kind":"variation","label":"f(x)","values":[{"value":"+\\\\infty"},{"value":"0"},{"value":"+\\\\infty"}],"arrows":["down","up"]}]}\n\nFormat graphe 2D (\`\`\`softmath-plot) :\n{"title":"Titre","xMin":-5,"xMax":5,"yMin":-4,"yMax":6,"curves":[{"id":"c1","expression":"x^2 - 1","color":"#6366f1","visible":true,"showDerivative":true}]}\n\nChoisis le bloc le plus pertinent pour visualiser la demande.`,
        userPrompt: `Génère le bloc visuel interactif adapté à l'énoncé ou fonction suivante :\n\n${targetText}${contextNote}`,
      };

    case 'convert-latex':
      return {
        actionPromptOverride:
          'Convertis uniquement le texte ou la formule fournie en Markdown + LaTeX KaTeX impeccable ($...$ pour inline, $$...$$ sur lignes dédiées pour blocs). Ne réponds QUE par le résultat converti, sans explication, sans guillemets et sans balise ```.',
        userPrompt: targetText,
      };
  }
}

/**
 * Nettoie une sortie Markdown générée par un LLM :
 * - supprime d'éventuels blocs ```markdown / ```latex englobants
 * - convertit \(...\) et \[...\] vers $...$ et $$...$$ (hors blocs de code)
 */
export function normalizeAiMarkdownForEditor(
  rawText: string,
  options: { unwrapOuterCodeFence?: boolean } = {}
): string {
  let text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return '';
  }

  if (options.unwrapOuterCodeFence) {
    const outerFenceMatch = text.match(
      /^```(?:markdown|md|latex|tex)?[ \t]*\n([\s\S]*?)\n```[ \t]*$/i
    );
    if (outerFenceMatch) {
      text = outerFenceMatch[1].trim();
    }
  }

  // Remplacer \[...\] et \(...\) hors blocs ```...```
  const segments = text.split(/(```[\s\S]*?```)/g);
  const normalizedSegments = segments.map((segment, index) => {
    if (index % 2 === 1) {
      return segment;
    }
    return segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => {
        const trimmed = inner.trim();
        return `\n$$\n${trimmed}\n$$\n`;
      })
      .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => {
        return `$${inner.trim()}$`;
      });
  });

  return normalizedSegments.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extrait et valide un bloc visuel SoftMath (`softmath-variation`, `softmath-plot`,
 * `softmath-matrix` ou `softmath-proba`) depuis une sortie JSON d'un LLM.
 */
export function extractValidVisualFenceFromAi(rawText: string): string | null {
  const cleaned = rawText.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return null;

  const explicitMatch = cleaned.match(
    /```(softmath-variation|softmath-plot|softmath-matrix|softmath-proba)[ \t]*\n([\s\S]*?)\n```/i
  );
  if (explicitMatch) {
    const lang = explicitMatch[1].toLowerCase();
    const jsonText = explicitMatch[2].trim();
    if (lang === 'softmath-variation') {
      return `\`\`\`softmath-variation\n${JSON.stringify(parseVariationTableConfig(jsonText), null, 2)}\n\`\`\``;
    }
    if (lang === 'softmath-plot') {
      return `\`\`\`softmath-plot\n${JSON.stringify(parseFunctionPlotConfig(jsonText), null, 2)}\n\`\`\``;
    }
    if (lang === 'softmath-matrix') {
      return `\`\`\`softmath-matrix\n${JSON.stringify(parseMatrixBlockConfig(jsonText), null, 2)}\n\`\`\``;
    }
    if (lang === 'softmath-proba') {
      return `\`\`\`softmath-proba\n${JSON.stringify(parseProbabilityTreeConfig(jsonText), null, 2)}\n\`\`\``;
    }
  }

  // Fallback: extract raw JSON object if LLM forgot the softmath-* tag
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      if (Array.isArray(obj.xValues) || Array.isArray(obj.rows)) {
        const cfg = parseVariationTableConfig(candidate);
        return `\`\`\`softmath-variation\n${JSON.stringify(cfg, null, 2)}\n\`\`\``;
      }
      if (Array.isArray(obj.curves)) {
        const cfg = parseFunctionPlotConfig(candidate);
        return `\`\`\`softmath-plot\n${JSON.stringify(cfg, null, 2)}\n\`\`\``;
      }
      if (Array.isArray(obj.entries)) {
        const cfg = parseMatrixBlockConfig(candidate);
        return `\`\`\`softmath-matrix\n${JSON.stringify(cfg, null, 2)}\n\`\`\``;
      }
      if (Array.isArray(obj.children)) {
        const cfg = parseProbabilityTreeConfig(candidate);
        return `\`\`\`softmath-proba\n${JSON.stringify(cfg, null, 2)}\n\`\`\``;
      }
    } catch {
      return null;
    }
  }

  return null;
}

