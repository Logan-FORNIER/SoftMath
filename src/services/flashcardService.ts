import {
  normalizeSlashes,
  readNoteContent,
  stripMdExtension,
} from './fsService';
import { flattenWorkspaceNotes } from './searchService';
import type { FileTreeNode, OpenNote } from '../types/notes';

export type FlashcardKind = 'definition' | 'theorem' | 'exercise' | 'example';
export type FlashcardMastery = 'new' | 'learning' | 'mastered';
export type FlashcardReviewRating = 'again' | 'medium' | 'mastered';

export interface FlashcardItem {
  id: string;
  notePath: string;
  noteTitle: string;
  kind: FlashcardKind;
  badgeLabel: string;
  frontMarkdown: string;
  backMarkdown: string;
}

export interface FlashcardProgressRecord {
  mastery: FlashcardMastery;
  reviews: number;
  lastReviewedAt: number;
  dueAt: number;
}

export type FlashcardProgressMap = Record<string, FlashcardProgressRecord>;

interface RawAcademicBlock {
  kind: 'definition' | 'theorem' | 'proof' | 'example' | 'exercise';
  title: string;
  body: string;
}

const STORAGE_PREFIX = 'softmath:flashcards:';

const BADGE_LABELS: Record<FlashcardKind, string> = {
  definition: 'Définition',
  theorem: 'Théorème',
  exercise: 'Exercice',
  example: 'Exemple',
};

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function parseTopLevelAcademicBlocks(markdown: string): RawAcademicBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: RawAcademicBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Ignore fenced code blocks so literal ::: inside examples are not treated as blocks
    if (trimmed.startsWith('```')) {
      i += 1;
      while (i < lines.length && lines[i].trim() !== '```') {
        i += 1;
      }
      i += 1;
      continue;
    }

    const openMatch = trimmed.match(
      /^:::(definition|theorem|proof|example|exercise)(?:\{collapsed\})?(?:\s+(.*))?$/
    );
    if (!openMatch) {
      i += 1;
      continue;
    }

    const kind = openMatch[1] as RawAcademicBlock['kind'];
    const title = (openMatch[2] ?? '').trim();
    const innerLines: string[] = [];
    let depth = 1;
    let j = i + 1;

    while (j < lines.length && depth > 0) {
      const innerTrim = lines[j].trim();
      if (
        /^:::(definition|theorem|proof|example|exercise)(?:\{collapsed\})?(?:\s+.*)?$/.test(
          innerTrim
        )
      ) {
        depth += 1;
      } else if (innerTrim === ':::') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      innerLines.push(lines[j]);
      j += 1;
    }

    blocks.push({
      kind,
      title,
      body: innerLines.join('\n').trim(),
    });
    i = j + 1;
  }

  return blocks;
}

function splitByHorizontalRuleOrCorrection(
  body: string
): { front: string; back: string } | null {
  const hrMatch = body.match(/\n\s*(?:-{3,}|\*{3,})\s*\n/);
  if (hrMatch && hrMatch.index !== undefined) {
    const front = body.slice(0, hrMatch.index).trim();
    const back = body.slice(hrMatch.index + hrMatch[0].length).trim();
    if (front && back) {
      return { front, back };
    }
  }

  const correctionMatch = body.match(
    /\n\s*(?:#{1,4}\s*|\*\*)(?:Correction|Solution|Réponse)\b[^\n]*\n/i
  );
  if (correctionMatch && correctionMatch.index !== undefined) {
    const front = body.slice(0, correctionMatch.index).trim();
    const back = body.slice(correctionMatch.index).trim();
    if (front && back) {
      return { front, back };
    }
  }

  return null;
}

function extractNestedProof(body: string): { statement: string; proof: string } | null {
  const nested = parseTopLevelAcademicBlocks(body);
  const proofBlock = nested.find((b) => b.kind === 'proof' && b.body);
  if (!proofBlock) {
    return null;
  }

  const proofMatch = body.match(
    /:::proof(?:\{collapsed\})?[^\n]*\n[\s\S]*?\n:::/
  );
  const statement = proofMatch
    ? body.replace(proofMatch[0], '').trim()
    : body;

  if (!statement) {
    return null;
  }

  const proofHeader = proofBlock.title
    ? `**Démonstration — ${proofBlock.title}**\n\n`
    : '**Démonstration**\n\n';

  return {
    statement,
    proof: `${proofHeader}${proofBlock.body}`,
  };
}

/**
 * Extracts active-recall flashcards from SoftMath academic blocks inside a note:
 * - theorem + adjacent/nested proof -> Front: statement, Back: proof
 * - definition -> Front: term/prompt, Back: definition body
 * - exercise -> Front: prompt (split at `---` or Correction, or paired with proof)
 * - example -> Front: example title or split at `---`, Back: resolution
 */
export function extractFlashcardsFromMarkdown(
  notePath: string,
  noteTitle: string,
  markdown: string
): FlashcardItem[] {
  const blocks = parseTopLevelAcademicBlocks(markdown);
  const cards: FlashcardItem[] = [];
  const dupCounts = new Map<string, number>();

  const pushCard = (
    kind: FlashcardKind,
    frontMarkdown: string,
    backMarkdown: string
  ) => {
    const front = frontMarkdown.trim();
    const back = backMarkdown.trim();
    if (!front || !back) {
      return;
    }

    const baseSig = `${normalizeSlashes(notePath)}::${kind}::${fnv1aHash(front.slice(0, 120))}`;
    const seenCount = dupCounts.get(baseSig) ?? 0;
    dupCounts.set(baseSig, seenCount + 1);
    const id = seenCount === 0 ? baseSig : `${baseSig}:${seenCount}`;

    cards.push({
      id,
      notePath,
      noteTitle,
      kind,
      badgeLabel: BADGE_LABELS[kind],
      frontMarkdown: front,
      backMarkdown: back,
    });
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block.body) {
      continue;
    }

    if (block.kind === 'theorem') {
      const next = blocks[i + 1];
      const nestedProof = extractNestedProof(block.body);
      const theoremHeading = block.title
        ? `**Théorème — ${block.title}**\n\n`
        : '**Théorème**\n\n';

      if (next && next.kind === 'proof' && next.body) {
        const proofHeading = next.title
          ? `**Démonstration — ${next.title}**\n\n`
          : '**Démonstration**\n\n';
        pushCard(
          'theorem',
          `${theoremHeading}${block.body}`,
          `${proofHeading}${next.body}`
        );
        i += 1; // Consume paired proof
        continue;
      }

      if (nestedProof) {
        pushCard(
          'theorem',
          `${theoremHeading}${nestedProof.statement}`,
          nestedProof.proof
        );
        continue;
      }

      const split = splitByHorizontalRuleOrCorrection(block.body);
      if (split) {
        pushCard('theorem', `${theoremHeading}${split.front}`, split.back);
        continue;
      }

      const recallFront = block.title
        ? `**Énoncer le théorème :**\n\n${block.title}`
        : `**Énoncer le théorème** *(note : ${noteTitle})*`;
      pushCard('theorem', recallFront, block.body);
      continue;
    }

    if (block.kind === 'definition') {
      const split = splitByHorizontalRuleOrCorrection(block.body);
      if (split) {
        pushCard(
          'definition',
          block.title ? `**${block.title}**\n\n${split.front}` : split.front,
          split.back
        );
        continue;
      }

      if (block.title) {
        pushCard('definition', `**Définir :** ${block.title}`, block.body);
      } else {
        const firstLine = block.body.split('\n').find((l) => l.trim()) ?? 'Définition';
        pushCard(
          'definition',
          `**Définition** *(note : ${noteTitle})*\n\n${firstLine}`,
          block.body
        );
      }
      continue;
    }

    if (block.kind === 'exercise') {
      const next = blocks[i + 1];
      const exHeading = block.title
        ? `**Exercice — ${block.title}**\n\n`
        : '**Exercice**\n\n';

      if (next && next.kind === 'proof' && next.body) {
        const corrHeading = next.title
          ? `**Correction — ${next.title}**\n\n`
          : '**Correction**\n\n';
        pushCard(
          'exercise',
          `${exHeading}${block.body}`,
          `${corrHeading}${next.body}`
        );
        i += 1;
        continue;
      }

      const split = splitByHorizontalRuleOrCorrection(block.body);
      if (split) {
        pushCard('exercise', `${exHeading}${split.front}`, split.back);
      } else {
        pushCard(
          'exercise',
          `${exHeading}${block.body}`,
          '*Aucune correction associée dans cette note — évaluez votre résolution mentalement.*'
        );
      }
      continue;
    }

    if (block.kind === 'example') {
      const split = splitByHorizontalRuleOrCorrection(block.body);
      if (split) {
        pushCard(
          'example',
          block.title ? `**Exemple — ${block.title}**\n\n${split.front}` : split.front,
          split.back
        );
      } else if (block.title) {
        pushCard('example', `**Exemple :** ${block.title}`, block.body);
      }
      continue;
    }

    // Standalone proof not consumed by preceding theorem/exercise
    if (block.kind === 'proof' && block.title) {
      pushCard(
        'theorem',
        `**Démonstration à retrouver :** ${block.title}`,
        block.body
      );
    }
  }

  return cards;
}

export async function loadFlashcardsForScope(options: {
  rootPath: string;
  tree: FileTreeNode[];
  openTabs: OpenNote[];
  activeNote: OpenNote | null;
  secondaryNote?: OpenNote | null;
  scope: 'active' | 'workspace';
}): Promise<FlashcardItem[]> {
  const { rootPath, tree, openTabs, activeNote, secondaryNote, scope } = options;

  if (scope === 'active') {
    if (!activeNote) {
      return [];
    }
    return extractFlashcardsFromMarkdown(
      activeNote.path,
      stripMdExtension(activeNote.name),
      activeNote.content
    );
  }

  const inMemory = new Map<string, string>();
  for (const tab of openTabs) {
    inMemory.set(normalizeSlashes(tab.path), tab.content);
  }
  if (activeNote) {
    inMemory.set(normalizeSlashes(activeNote.path), activeNote.content);
  }
  if (secondaryNote) {
    inMemory.set(normalizeSlashes(secondaryNote.path), secondaryNote.content);
  }

  const entries = flattenWorkspaceNotes(tree, rootPath);
  const allCards: FlashcardItem[] = [];

  for (const entry of entries) {
    try {
      const normalized = normalizeSlashes(entry.path);
      const content = inMemory.has(normalized)
        ? (inMemory.get(normalized) ?? '')
        : await readNoteContent(entry.path);
      allCards.push(
        ...extractFlashcardsFromMarkdown(
          entry.path,
          stripMdExtension(entry.name),
          content
        )
      );
    } catch {
      // Skip unreadable note quietly so revision continues cleanly
    }
  }

  return allCards;
}

function getStorageKey(workspaceRoot: string): string {
  return `${STORAGE_PREFIX}${normalizeSlashes(workspaceRoot || 'default')}`;
}

export function loadFlashcardProgress(
  workspaceRoot: string
): FlashcardProgressMap {
  try {
    const raw = window.localStorage.getItem(getStorageKey(workspaceRoot));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as FlashcardProgressMap;
  } catch {
    return {};
  }
}

export function saveFlashcardProgress(
  workspaceRoot: string,
  progress: FlashcardProgressMap
): void {
  try {
    window.localStorage.setItem(
      getStorageKey(workspaceRoot),
      JSON.stringify(progress)
    );
  } catch {
    // Ignore quota errors in storage
  }
}

export function recordFlashcardReview(
  workspaceRoot: string,
  progress: FlashcardProgressMap,
  cardId: string,
  rating: FlashcardReviewRating,
  now = Date.now()
): FlashcardProgressMap {
  const prev = progress[cardId];
  let mastery: FlashcardMastery = 'learning';
  let dueOffsetMs = 0;

  if (rating === 'again') {
    mastery = 'learning';
    dueOffsetMs = 0;
  } else if (rating === 'medium') {
    mastery = 'learning';
    dueOffsetMs = 4 * 3600_000;
  } else {
    mastery = 'mastered';
    dueOffsetMs = 3 * 24 * 3600_000;
  }

  const next: FlashcardProgressMap = {
    ...progress,
    [cardId]: {
      mastery,
      reviews: (prev?.reviews ?? 0) + 1,
      lastReviewedAt: now,
      dueAt: now + dueOffsetMs,
    },
  };

  saveFlashcardProgress(workspaceRoot, next);
  return next;
}

export function resetFlashcardProgress(workspaceRoot: string): FlashcardProgressMap {
  try {
    window.localStorage.removeItem(getStorageKey(workspaceRoot));
  } catch {
    // Ignore storage removal errors
  }
  return {};
}

