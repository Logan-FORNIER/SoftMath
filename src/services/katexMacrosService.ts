import katex from 'katex';

export interface KatexMacroEntry {
  id: string;
  name: string;
  expansion: string;
  description?: string;
  enabled: boolean;
}

export const KATEX_MACROS_STORAGE_KEY = 'softmath:katexMacros';
export const KATEX_MACROS_CHANGED_EVENT = 'softmath:katex-macros-changed';

export const DEFAULT_KATEX_MACROS: KatexMacroEntry[] = [
  { id: 'macro-r', name: '\\R', expansion: '\\mathbb{R}', description: 'Corps des réels', enabled: true },
  { id: 'macro-n', name: '\\N', expansion: '\\mathbb{N}', description: 'Entiers naturels', enabled: true },
  { id: 'macro-z', name: '\\Z', expansion: '\\mathbb{Z}', description: 'Entiers relatifs', enabled: true },
  { id: 'macro-q', name: '\\Q', expansion: '\\mathbb{Q}', description: 'Nombres rationnels', enabled: true },
  { id: 'macro-c', name: '\\C', expansion: '\\mathbb{C}', description: 'Nombres complexes', enabled: true },
  { id: 'macro-k', name: '\\K', expansion: '\\mathbb{K}', description: 'Corps quelconque', enabled: true },
  { id: 'macro-eps', name: '\\eps', expansion: '\\varepsilon', description: 'Epsilon', enabled: true },
  { id: 'macro-ds', name: '\\ds', expansion: '\\displaystyle', description: 'Displaystyle', enabled: true },
  { id: 'macro-ssi', name: '\\ssi', expansion: '\\Longleftrightarrow', description: 'Équivalence logique', enabled: true },
  { id: 'macro-limn', name: '\\limn', expansion: '\\lim_{n \\to +\\infty}', description: 'Limite en +∞', enabled: true },
  { id: 'macro-norm', name: '\\norm', expansion: '\\left\\lVert #1 \\right\\rVert', description: 'Norme (1 arg)', enabled: true },
];

export function normalizeMacroName(raw: string): string {
  const trimmed = raw.trim().replace(/^\\+/, '');
  const clean = trimmed.replace(/[^a-zA-Z]/g, '');
  return clean ? `\\${clean}` : '';
}

function cloneDefaults(): KatexMacroEntry[] {
  return DEFAULT_KATEX_MACROS.map((entry) => ({ ...entry }));
}

export function loadKatexMacroEntries(): KatexMacroEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return cloneDefaults();
  }
  try {
    const raw = window.localStorage.getItem(KATEX_MACROS_STORAGE_KEY);
    if (!raw) {
      return cloneDefaults();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return cloneDefaults();
    }
    const normalized: KatexMacroEntry[] = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i];
      if (!item || typeof item !== 'object') continue;
      const name = normalizeMacroName(String(item.name ?? ''));
      const expansion = String(item.expansion ?? '').trim();
      if (!name || !expansion) continue;
      normalized.push({
        id: String(item.id || `macro-${i}-${name.slice(1)}`),
        name,
        expansion,
        description: item.description ? String(item.description).trim() : '',
        enabled: item.enabled !== false,
      });
    }
    return normalized.length > 0 ? normalized : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export function saveKatexMacroEntries(entries: KatexMacroEntry[]): KatexMacroEntry[] {
  const sanitized = entries
    .map((entry, idx) => ({
      id: entry.id || `macro-${idx}-${Date.now()}`,
      name: normalizeMacroName(entry.name),
      expansion: entry.expansion.trim(),
      description: entry.description?.trim() || '',
      enabled: entry.enabled !== false,
    }))
    .filter((entry) => entry.name.length > 1 && entry.expansion.length > 0);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(KATEX_MACROS_STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new CustomEvent(KATEX_MACROS_CHANGED_EVENT));
    } catch {
      // ignore storage quota errors
    }
  }
  return sanitized;
}

export function resetKatexMacroEntries(): KatexMacroEntry[] {
  const defaults = cloneDefaults();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(KATEX_MACROS_STORAGE_KEY, JSON.stringify(defaults));
      window.dispatchEvent(new CustomEvent(KATEX_MACROS_CHANGED_EVENT));
    } catch {
      // ignore
    }
  }
  return defaults;
}

export function buildKatexMacroMap(entries?: KatexMacroEntry[]): Record<string, string> {
  const list = entries ?? loadKatexMacroEntries();
  const map: Record<string, string> = {};
  for (const entry of list) {
    if (!entry.enabled) continue;
    const key = normalizeMacroName(entry.name);
    const val = entry.expansion.trim();
    if (key && val) {
      map[key] = val;
    }
  }
  return map;
}

export function renderKatexWithMacros(
  source: string,
  options: {
    displayMode?: boolean;
    throwOnError?: boolean;
    strict?: boolean | 'ignore' | 'warn' | 'error';
    trust?: boolean;
    macros?: Record<string, string>;
  } = {}
): string {
  const macros = options.macros ?? buildKatexMacroMap();
  return katex.renderToString(source, {
    displayMode: options.displayMode ?? false,
    throwOnError: options.throwOnError ?? false,
    strict: options.strict ?? 'ignore',
    trust: options.trust ?? false,
    macros,
  });
}

export function countMacroArguments(expansion: string): number {
  let maxArg = 0;
  const regex = /#([1-9])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(expansion)) !== null) {
    const num = Number(match[1]);
    if (num > maxArg) maxArg = num;
  }
  return maxArg;
}

export function exportLatexMacrosPreamble(entries?: KatexMacroEntry[]): string {
  const list = (entries ?? loadKatexMacroEntries()).filter((e) => e.enabled);
  if (list.length === 0) return '';
  const lines = list
    .map((entry) => {
      const name = normalizeMacroName(entry.name);
      const expansion = entry.expansion.trim();
      if (!name || !expansion) return null;
      const argc = countMacroArguments(expansion);
      const argSpec = argc > 0 ? `[${argc}]` : '';
      return `\\providecommand{${name}}${argSpec}{${expansion}}`;
    })
    .filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

