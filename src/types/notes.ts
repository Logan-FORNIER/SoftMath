export type ThemeMode = 'light' | 'dark';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type EntryKind = 'folder' | 'note';

export interface FileTreeNode {
  id: string;
  name: string;
  displayName: string;
  path: string;
  kind: EntryKind;
  children?: FileTreeNode[];
}

export interface OpenNote {
  sessionId: number;
  path: string;
  name: string;
  displayName: string;
  content: string;
  lastSavedContent: string;
}

export interface RenameResult {
  oldPath: string;
  newPath: string;
  newName: string;
  displayName: string;
}

export interface OutlineHeading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
}

