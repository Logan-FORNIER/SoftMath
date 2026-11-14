export interface WikiLinkRef {
  target: string;
  label: string;
  line: number;
  snippet: string;
}

export interface WorkspaceNoteSnapshot {
  path: string;
  displayName: string;
  relativePath: string;
  content: string;
}

export interface BacklinkEntry {
  sourcePath: string;
  sourceTitle: string;
  relativePath: string;
  line: number;
  snippet: string;
}

export interface KnowledgeGraphNode {
  id: string;
  path: string;
  label: string;
  relativePath: string;
  inDegree: number;
  outDegree: number;
  exists: boolean;
}

export interface KnowledgeGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export function normalizeWikiKey(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function extractWikiLinks(content: string): WikiLinkRef[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const refs: WikiLinkRef[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    // Match [[target]] or [[target|label]] without matching ![[asset.excalidraw]]
    const regex = /(^|[^!])\[\[([^[\]]+?)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const inner = match[2].trim();
      if (!inner || inner.toLowerCase().endsWith('.excalidraw')) continue;
      const pipeIdx = inner.indexOf('|');
      const target = (pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner).trim();
      const label = (pipeIdx !== -1 ? inner.slice(pipeIdx + 1) : target).trim();
      if (!target) continue;
      refs.push({
        target,
        label: label || target,
        line: i + 1,
        snippet: line.trim().slice(0, 140),
      });
    }
  }

  return refs;
}

export function resolveWikiTarget<
  T extends { path: string; displayName: string; relativePath?: string }
>(target: string, notes: T[]): T | null {
  const key = normalizeWikiKey(target);
  if (!key) return null;

  // 1. Exact relative path or filename match
  for (const n of notes) {
    const relKey = normalizeWikiKey(n.relativePath ?? n.path);
    const nameKey = normalizeWikiKey(n.displayName);
    if (relKey === key || nameKey === key) {
      return n;
    }
  }

  // 2. Suffix path match (e.g. "Analyse/Suites" matches "Maths/Analyse/Suites.md")
  for (const n of notes) {
    const relKey = normalizeWikiKey(n.relativePath ?? n.path);
    if (relKey.endsWith(`/${key}`)) {
      return n;
    }
  }

  // 3. Fallback partial prefix match
  for (const n of notes) {
    const nameKey = normalizeWikiKey(n.displayName);
    if (nameKey.includes(key)) {
      return n;
    }
  }

  return null;
}

export function buildNoteSnippet(content: string, maxLength = 150): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let inFence = false;
  const collected: string[] = [];

  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !t) continue;
    if (/^:::(definition|theorem|proof|example|exercise)/.test(t) || t === ':::') {
      continue;
    }
    if (/^!\[\[.*\]\]$/.test(t)) continue;
    const clean = t
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1');
    collected.push(clean);
    if (collected.join(' ').length >= maxLength) break;
  }

  const joined = collected.join(' — ').trim();
  if (!joined) return 'Note vide.';
  return joined.length > maxLength
    ? `${joined.slice(0, maxLength - 1).trimEnd()}…`
    : joined;
}

export function findBacklinksForNote(
  targetNote: { path: string; displayName: string; relativePath: string },
  allNotes: WorkspaceNoteSnapshot[]
): BacklinkEntry[] {
  const targetKeys = new Set<string>([
    normalizeWikiKey(targetNote.displayName),
    normalizeWikiKey(targetNote.relativePath),
  ]);

  const entries: BacklinkEntry[] = [];
  for (const source of allNotes) {
    if (source.path === targetNote.path) continue;
    const links = extractWikiLinks(source.content);
    for (const link of links) {
      const resolved = resolveWikiTarget(link.target, allNotes);
      const matchesDirect = targetKeys.has(normalizeWikiKey(link.target));
      if ((resolved && resolved.path === targetNote.path) || matchesDirect) {
        entries.push({
          sourcePath: source.path,
          sourceTitle: source.displayName,
          relativePath: source.relativePath,
          line: link.line,
          snippet: link.snippet,
        });
        break;
      }
    }
  }

  return entries;
}

export function buildWorkspaceKnowledgeGraph(
  allNotes: WorkspaceNoteSnapshot[]
): KnowledgeGraphData {
  const nodeMap = new Map<string, KnowledgeGraphNode>();
  for (const note of allNotes) {
    nodeMap.set(note.path, {
      id: note.path,
      path: note.path,
      label: note.displayName,
      relativePath: note.relativePath,
      inDegree: 0,
      outDegree: 0,
      exists: true,
    });
  }

  const edges: KnowledgeGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const source of allNotes) {
    const links = extractWikiLinks(source.content);
    for (const link of links) {
      const resolved = resolveWikiTarget(link.target, allNotes);
      const targetId = resolved
        ? resolved.path
        : `missing:${normalizeWikiKey(link.target)}`;

      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, {
          id: targetId,
          path: '',
          label: link.target,
          relativePath: link.target,
          inDegree: 0,
          outDegree: 0,
          exists: false,
        });
      }

      if (targetId === source.path) continue;
      const edgeKey = `${source.path}=>${targetId}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);

      edges.push({
        id: edgeKey,
        sourceId: source.path,
        targetId,
      });

      const srcNode = nodeMap.get(source.path);
      const dstNode = nodeMap.get(targetId);
      if (srcNode) srcNode.outDegree += 1;
      if (dstNode) dstNode.inDegree += 1;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

