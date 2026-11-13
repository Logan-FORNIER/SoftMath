import { basename, dirname, join } from '@tauri-apps/api/path';
import { confirm, open } from '@tauri-apps/plugin-dialog';
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type { EntryKind, FileTreeNode, RenameResult } from '../types/notes';

const INVALID_FILENAME_CHARS = /[/\\:*?"<>|\x00-\x1f]/;

export function isMarkdownFile(fileName: string): boolean {
  return /\.md$/i.test(fileName);
}

export function stripMdExtension(fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

export function formatFsError(err: unknown, fallback: string): string {
  const raw =
    typeof err === 'string'
      ? err.trim()
      : err instanceof Error
        ? err.message.trim()
        : '';

  if (!raw) {
    return fallback;
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes('enoent') ||
    lower.includes('no such file') ||
    lower.includes('os error 2') ||
    lower.includes('os error 3') ||
    lower.includes('cannot find the file') ||
    lower.includes('cannot find the path')
  ) {
    return `${fallback} Le fichier ou dossier est introuvable sur le disque.`;
  }

  if (
    lower.includes('eacces') ||
    lower.includes('eperm') ||
    lower.includes('permission denied') ||
    lower.includes('os error 5')
  ) {
    return `${fallback} Accès refusé par le système de fichiers.`;
  }

  return raw;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    return await exists(targetPath);
  } catch {
    return false;
  }
}

export function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function isSameOrChildPath(candidatePath: string, parentPath: string): boolean {
  const candidate = normalizeSlashes(candidatePath);
  const parent = normalizeSlashes(parentPath);
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

export function replacePathPrefix(
  targetPath: string,
  oldPrefix: string,
  newPrefix: string
): string {
  const normalizedTarget = normalizeSlashes(targetPath);
  const normalizedOld = normalizeSlashes(oldPrefix);
  if (normalizedTarget === normalizedOld) {
    return newPrefix;
  }
  if (normalizedTarget.startsWith(`${normalizedOld}/`)) {
    const trimmedOld = oldPrefix.replace(/[\\/]+$/, '');
    const suffix = targetPath.slice(trimmedOld.length);
    return `${newPrefix.replace(/[\\/]+$/, '')}${suffix}`;
  }
  return targetPath;
}

export function getRelativeSegments(rootPath: string, targetPath: string): string[] {
  const normRoot = normalizeSlashes(rootPath);
  const normTarget = normalizeSlashes(targetPath);
  if (!normTarget.startsWith(`${normRoot}/`)) {
    return normTarget.split('/').filter(Boolean);
  }
  const rel = normTarget.slice(normRoot.length + 1);
  return rel.split('/').filter(Boolean);
}

export function countNotesInTree(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.kind === 'note') {
      count += 1;
    } else if (node.children) {
      count += countNotesInTree(node.children);
    }
  }
  return count;
}

function validateEntryName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Le nom ne peut pas être vide.');
  }
  if (INVALID_FILENAME_CHARS.test(trimmed)) {
    throw new Error('Le nom contient des caractères non autorisés (/ \\ : * ? " < > |).');
  }
  return trimmed;
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }
  return a.displayName.localeCompare(b.displayName, 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Opens a native OS folder picker and grants recursive fs scope for the chosen directory.
 */
export async function pickNotesFolder(): Promise<string | null> {
  const selected = await open({
    title: 'Ouvrir un dossier de notes',
    directory: true,
    recursive: true,
    multiple: false,
  });

  if (typeof selected === 'string' && selected.length > 0) {
    return selected;
  }
  return null;
}

async function readTreeRecursive(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await readDir(dirPath);
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    // Skip hidden files/folders (e.g. .git, .obsidian, .DS_Store) and symlinks to prevent cycles.
    if (!entry.name || entry.name.startsWith('.') || entry.isSymlink) {
      continue;
    }

    const fullPath = await join(dirPath, entry.name);

    if (entry.isDirectory) {
      let children: FileTreeNode[] = [];
      try {
        children = await readTreeRecursive(fullPath);
      } catch {
        children = [];
      }
      nodes.push({
        id: fullPath,
        name: entry.name,
        displayName: entry.name,
        path: fullPath,
        kind: 'folder',
        children,
      });
    } else if (entry.isFile && isMarkdownFile(entry.name)) {
      nodes.push({
        id: fullPath,
        name: entry.name,
        displayName: stripMdExtension(entry.name),
        path: fullPath,
        kind: 'note',
      });
    }
  }

  nodes.sort(compareNodes);
  return nodes;
}

export async function readWorkspaceTree(rootPath: string): Promise<FileTreeNode[]> {
  return readTreeRecursive(rootPath);
}

export async function readNoteContent(filePath: string): Promise<string> {
  return readTextFile(filePath);
}

export async function writeNoteContent(filePath: string, content: string): Promise<void> {
  await writeTextFile(filePath, content);
}

async function findAvailableName(
  parentDir: string,
  baseName: string,
  extension: string
): Promise<{ name: string; fullPath: string }> {
  let index = 1;
  while (index < 10_000) {
    const suffix = index === 1 ? '' : ` ${index}`;
    const candidateName = `${baseName}${suffix}${extension}`;
    const candidatePath = await join(parentDir, candidateName);
    if (!(await exists(candidatePath))) {
      return { name: candidateName, fullPath: candidatePath };
    }
    index += 1;
  }
  throw new Error('Impossible de générer un nom de fichier unique.');
}

export async function createMarkdownNote(
  parentDir: string,
  requestedBaseName?: string
): Promise<{ path: string; name: string; displayName: string }> {
  const baseName = requestedBaseName
    ? validateEntryName(stripMdExtension(requestedBaseName))
    : 'Nouvelle note';

  const { name, fullPath } = requestedBaseName
    ? { name: `${baseName}.md`, fullPath: await join(parentDir, `${baseName}.md`) }
    : await findAvailableName(parentDir, baseName, '.md');

  if (requestedBaseName && (await exists(fullPath))) {
    throw new Error('Une note portant ce nom existe déjà.');
  }

  await writeTextFile(fullPath, '');

  return {
    path: fullPath,
    name,
    displayName: stripMdExtension(name),
  };
}

export async function createSubfolder(
  parentDir: string,
  requestedName?: string
): Promise<{ path: string; name: string }> {
  const baseName = requestedName ? validateEntryName(requestedName) : 'Nouveau dossier';

  const { name, fullPath } = requestedName
    ? { name: baseName, fullPath: await join(parentDir, baseName) }
    : await findAvailableName(parentDir, baseName, '');

  if (requestedName && (await exists(fullPath))) {
    throw new Error('Un dossier portant ce nom existe déjà.');
  }

  await mkdir(fullPath);
  return { path: fullPath, name };
}

export async function renameFsEntry(
  oldPath: string,
  rawNewName: string,
  kind: EntryKind
): Promise<RenameResult> {
  const cleaned = validateEntryName(
    kind === 'note' ? stripMdExtension(rawNewName) : rawNewName
  );
  const newName = kind === 'note' ? `${cleaned}.md` : cleaned;
  const parentDir = await dirname(oldPath);
  const newPath = await join(parentDir, newName);

  if (oldPath === newPath) {
    return {
      oldPath,
      newPath,
      newName,
      displayName: kind === 'note' ? stripMdExtension(newName) : newName,
    };
  }

  const isCaseOnlyRename = oldPath.toLowerCase() === newPath.toLowerCase();
  if (!isCaseOnlyRename && (await exists(newPath))) {
    throw new Error('Un élément portant ce nom existe déjà dans ce dossier.');
  }

  await rename(oldPath, newPath);

  return {
    oldPath,
    newPath,
    newName,
    displayName: kind === 'note' ? stripMdExtension(newName) : newName,
  };
}

export async function confirmAndDeleteEntry(
  targetPath: string,
  displayName: string,
  kind: EntryKind
): Promise<boolean> {
  const message =
    kind === 'folder'
      ? `Voulez-vous vraiment supprimer le dossier « ${displayName} » et tout son contenu ?`
      : `Voulez-vous vraiment supprimer la note « ${displayName} » ?`;

  const confirmed = await confirm(message, {
    title: kind === 'folder' ? 'Supprimer le dossier' : 'Supprimer la note',
    kind: 'warning',
    okLabel: 'Supprimer',
    cancelLabel: 'Annuler',
  });

  if (!confirmed) {
    return false;
  }

  await remove(targetPath, { recursive: kind === 'folder' });
  return true;
}

export async function getFolderDisplayName(folderPath: string): Promise<string> {
  try {
    const name = await basename(folderPath);
    return name || folderPath;
  } catch {
    return folderPath;
  }
}

export const DEFAULT_DRAWING_HEIGHT = 360;
export const MIN_DRAWING_HEIGHT = 180;
export const MAX_DRAWING_HEIGHT = 760;

export interface ExcalidrawAssetRecord {
  found: boolean;
  rawJson: string | null;
  height?: number;
}

export function clampDrawingHeight(height: number | undefined): number {
  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return DEFAULT_DRAWING_HEIGHT;
  }
  return Math.round(
    Math.min(MAX_DRAWING_HEIGHT, Math.max(MIN_DRAWING_HEIGHT, height))
  );
}

export function sanitizeDrawingAssetName(rawSrc: string): string {
  const normalized = rawSrc.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  const fileName = normalized.startsWith('.assets/')
    ? normalized.slice('.assets/'.length)
    : normalized;

  if (
    !fileName ||
    fileName.startsWith('/') ||
    fileName.includes('..') ||
    fileName.includes('/') ||
    INVALID_FILENAME_CHARS.test(fileName)
  ) {
    throw new Error(`Nom de fichier de schéma invalide : "${rawSrc}".`);
  }

  return fileName;
}

function generateCandidateDrawingFileName(): string {
  const timePart = Date.now().toString(36).slice(-5);
  const randPart = Math.random().toString(36).slice(2, 6);
  return `schema-${timePart}${randPart}.excalidraw.json`;
}

export async function getDrawingAssetsDir(notePath: string): Promise<string> {
  const noteDir = await dirname(notePath);
  return join(noteDir, '.assets');
}

export async function getDrawingAssetPath(
  notePath: string,
  rawSrc: string
): Promise<string> {
  const fileName = sanitizeDrawingAssetName(rawSrc);
  const assetsDir = await getDrawingAssetsDir(notePath);
  return join(assetsDir, fileName);
}

export async function readDrawingAsset(
  notePath: string,
  rawSrc: string
): Promise<ExcalidrawAssetRecord> {
  const assetPath = await getDrawingAssetPath(notePath, rawSrc);
  if (!(await exists(assetPath))) {
    return { found: false, rawJson: null };
  }

  const rawJson = await readTextFile(assetPath);
  let height: number | undefined;
  try {
    const parsed = JSON.parse(rawJson) as {
      softmath?: { height?: unknown };
    };
    if (typeof parsed?.softmath?.height === 'number') {
      height = clampDrawingHeight(parsed.softmath.height);
    }
  } catch {
    // Let the caller handle invalid JSON if any
  }

  return { found: true, rawJson, height };
}

export async function writeDrawingAsset(
  notePath: string,
  rawSrc: string,
  serializedSceneJson: string,
  height?: number
): Promise<void> {
  const assetsDir = await getDrawingAssetsDir(notePath);
  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }

  const assetPath = await getDrawingAssetPath(notePath, rawSrc);
  let contentToWrite = serializedSceneJson;

  if (height !== undefined) {
    try {
      const parsed = JSON.parse(serializedSceneJson) as Record<string, unknown>;
      const prevMeta =
        typeof parsed.softmath === 'object' && parsed.softmath !== null
          ? (parsed.softmath as Record<string, unknown>)
          : {};
      parsed.softmath = {
        ...prevMeta,
        height: clampDrawingHeight(height),
      };
      contentToWrite = JSON.stringify(parsed, null, 2);
    } catch {
      contentToWrite = serializedSceneJson;
    }
  }

  await writeTextFile(assetPath, contentToWrite);
}

export async function createEmptyDrawingAsset(
  notePath: string,
  height = DEFAULT_DRAWING_HEIGHT
): Promise<string> {
  const assetsDir = await getDrawingAssetsDir(notePath);
  if (!(await exists(assetsDir))) {
    await mkdir(assetsDir, { recursive: true });
  }

  let fileName = generateCandidateDrawingFileName();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidatePath = await join(assetsDir, fileName);
    if (!(await exists(candidatePath))) {
      break;
    }
    fileName = generateCandidateDrawingFileName();
  }

  const emptyScene = {
    type: 'excalidraw',
    version: 2,
    source: 'https://softmath.app',
    elements: [],
    appState: {
      gridSize: 20,
      viewBackgroundColor: '#ffffff',
    },
    files: {},
    softmath: {
      height: clampDrawingHeight(height),
    },
  };

  await writeDrawingAsset(
    notePath,
    fileName,
    JSON.stringify(emptyScene, null, 2)
  );
  return fileName;
}
