export interface NoteSnapshot {
  id: string;
  notePath: string;
  label: string;
  createdAt: number;
  content: string;
  lineCount: number;
}

export interface SnapshotDiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

const SNAPSHOT_PREFIX = 'softmath:snapshots:';
const MAX_SNAPSHOTS_PER_NOTE = 25;

function storageKeyForNote(notePath: string): string {
  return `${SNAPSHOT_PREFIX}${notePath.replace(/\\/g, '/')}`;
}

export function listNoteSnapshots(notePath: string): NoteSnapshot[] {
  if (!notePath || typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKeyForNote(notePath));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is NoteSnapshot =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.content === 'string' &&
          typeof item.createdAt === 'number'
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveNoteSnapshot(
  notePath: string,
  content: string,
  label = 'Instantané',
  options: { skipIfIdentical?: boolean } = {}
): NoteSnapshot | null {
  if (!notePath) return null;
  const existing = listNoteSnapshots(notePath);
  if (
    options.skipIfIdentical &&
    existing.length > 0 &&
    existing[0].content === content
  ) {
    return existing[0];
  }

  const snapshot: NoteSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    notePath,
    label,
    createdAt: Date.now(),
    content,
    lineCount: content ? content.split(/\r?\n/).length : 0,
  };

  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS_PER_NOTE);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(storageKeyForNote(notePath), JSON.stringify(next));
    } catch {
      // ignore storage quota exceeded
    }
  }
  return snapshot;
}

export function deleteNoteSnapshot(notePath: string, snapshotId: string): NoteSnapshot[] {
  const next = listNoteSnapshots(notePath).filter((s) => s.id !== snapshotId);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(storageKeyForNote(notePath), JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

/**
 * Simple LCS line diff between snapshot (`before`) and current note (`after`).
 */
export function computeSnapshotDiff(
  before: string,
  after: string
): SnapshotDiffLine[] {
  const a = before.replace(/\r\n/g, '\n').split('\n');
  const b = after.replace(/\r\n/g, '\n').split('\n');

  // Guard huge files cleanly
  if (a.length * b.length > 60000) {
    const out: SnapshotDiffLine[] = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i += 1) {
      if (i < a.length && i < b.length && a[i] === b[i]) {
        out.push({ kind: 'same', text: a[i] });
      } else {
        if (i < a.length) out.push({ kind: 'removed', text: a[i] });
        if (i < b.length) out.push({ kind: 'added', text: b[i] });
      }
    }
    return out;
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: SnapshotDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      diff.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ kind: 'removed', text: a[i] });
      i += 1;
    } else {
      diff.push({ kind: 'added', text: b[j] });
      j += 1;
    }
  }
  while (i < m) {
    diff.push({ kind: 'removed', text: a[i] });
    i += 1;
  }
  while (j < n) {
    diff.push({ kind: 'added', text: b[j] });
    j += 1;
  }

  return diff;
}

