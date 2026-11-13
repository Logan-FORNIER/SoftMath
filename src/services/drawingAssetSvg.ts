import { dirname, join } from '@tauri-apps/api/path';
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs';

const ASSETS_DIR_NAME = '.assets';

function resolveSvgAssetFileName(rawJsonSrc: string): string {
  const fileNameOnly = rawJsonSrc.trim().split(/[\\/]/).pop() ?? 'schema.excalidraw.json';
  const baseName = fileNameOnly
    .replace(/\.excalidraw\.json$/i, '')
    .replace(/\.json$/i, '');
  return `${baseName}.svg`;
}

/**
 * Exporte et persiste une copie vectorielle `.svg` du schéma dans `.assets/`
 * aux côtés du fichier `.excalidraw.json` pour rendre le dossier portable et imprimable.
 */
export async function writeDrawingSvgAsset(
  notePath: string,
  rawJsonSrc: string,
  svgContent: string
): Promise<void> {
  const noteDir = await dirname(notePath);
  const assetsDir = await join(noteDir, ASSETS_DIR_NAME);
  await mkdir(assetsDir, { recursive: true });
  const svgFileName = resolveSvgAssetFileName(rawJsonSrc);
  const svgFilePath = await join(assetsDir, svgFileName);
  await writeTextFile(svgFilePath, svgContent);
}

