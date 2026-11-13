import { getRelativeSegments } from './fsService';
import type { FileTreeNode } from '../types/notes';

export interface FlatNoteEntry {
  id: string;
  path: string;
  name: string;
  displayName: string;
  relativeFolder: string;
  node: FileTreeNode;
}

export interface IndexedSearchNote extends FlatNoteEntry {
  content: string;
  normalizedTitle: string;
  normalizedFolder: string;
  normalizedContent: string;
}

export interface SearchMatchResult {
  entry: IndexedSearchNote;
  score: number;
  snippet: string | null;
  matchTerms: string[];
}

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function flattenWorkspaceNotes(
  tree: FileTreeNode[],
  rootPath: string
): FlatNoteEntry[] {
  const results: FlatNoteEntry[] = [];

  const visit = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        if (node.children) {
          visit(node.children);
        }
        continue;
      }

      const segments = getRelativeSegments(rootPath, node.path);
      const relativeFolder =
        segments.length > 1 ? segments.slice(0, -1).join(' / ') : '';

      results.push({
        id: node.id,
        path: node.path,
        name: node.name,
        displayName: node.displayName,
        relativeFolder,
        node,
      });
    }
  };

  visit(tree);
  return results;
}

export function buildIndexedNote(
  entry: FlatNoteEntry,
  content: string
): IndexedSearchNote {
  return {
    ...entry,
    content,
    normalizedTitle: normalizeForSearch(entry.displayName),
    normalizedFolder: normalizeForSearch(entry.relativeFolder),
    normalizedContent: normalizeForSearch(content),
  };
}

function cleanLineForSnippet(line: string): string {
  return line
    .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContentSnippet(content: string, terms: string[]): string | null {
  if (!content || terms.length === 0) {
    return null;
  }

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^!\[\[[^\]]+\]\]$/.test(trimmed)) {
      continue;
    }

    const cleaned = cleanLineForSnippet(trimmed);
    const normalizedLine = normalizeForSearch(cleaned);
    let firstIdx = -1;

    for (const term of terms) {
      const idx = normalizedLine.indexOf(term);
      if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
        firstIdx = idx;
      }
    }

    if (firstIdx === -1) {
      continue;
    }

    const maxLength = 110;
    if (cleaned.length <= maxLength) {
      return cleaned;
    }

    const start = Math.max(0, firstIdx - 32);
    const end = Math.min(cleaned.length, start + maxLength);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < cleaned.length ? '…' : '';
    return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`;
  }

  return null;
}

export function searchIndexedNotes(
  notes: IndexedSearchNote[],
  rawQuery: string,
  limit = 40
): SearchMatchResult[] {
  const normalizedQuery = normalizeForSearch(rawQuery).trim();
  if (!normalizedQuery) {
    return notes.slice(0, limit).map((entry) => ({
      entry,
      score: 0,
      snippet: null,
      matchTerms: [],
    }));
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches: SearchMatchResult[] = [];

  for (const entry of notes) {
    let allTermsPresent = true;
    let score = 0;
    let matchedContent = false;

    for (const term of terms) {
      const inTitle = entry.normalizedTitle.includes(term);
      const inFolder = entry.normalizedFolder.includes(term);
      const inContent = entry.normalizedContent.includes(term);

      if (!inTitle && !inFolder && !inContent) {
        allTermsPresent = false;
        break;
      }

      if (inTitle) {
        score += entry.normalizedTitle === normalizedQuery ? 100 : 25;
        if (entry.normalizedTitle.startsWith(term)) {
          score += 30;
        }
      }
      if (inFolder) {
        score += 10;
      }
      if (inContent) {
        score += 6;
        matchedContent = true;
      }
    }

    if (!allTermsPresent) {
      continue;
    }

    const snippet = matchedContent ? buildContentSnippet(entry.content, terms) : null;
    matches.push({
      entry,
      score,
      snippet,
      matchTerms: terms,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.entry.displayName.localeCompare(b.entry.displayName, 'fr', {
      numeric: true,
      sensitivity: 'base',
    });
  });

  return matches.slice(0, limit);
}

