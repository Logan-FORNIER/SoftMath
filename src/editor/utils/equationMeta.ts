export interface BlockMathMeta {
  numbered: boolean;
  label: string;
  body: string;
}

const EQ_HEADER_RE = /^%\s*softmath-eq:(.*)$/;

/**
 * Parses optional SoftMath equation numbering/label metadata stored cleanly
 * in a leading LaTeX comment line inside `$$ ... $$` blocks.
 */
export function parseBlockMathMeta(rawLatex: string): BlockMathMeta {
  const normalized = rawLatex.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  const match = firstLine.match(EQ_HEADER_RE);

  if (!match) {
    return {
      numbered: false,
      label: '',
      body: normalized,
    };
  }

  const metaLine = match[1] ?? '';
  const numbered = /\bnumbered\b/.test(metaLine);
  const labelMatch = metaLine.match(/\blabel=([A-Za-z0-9_.:-]+)/);
  const label = labelMatch ? labelMatch[1] : '';
  const body = lines.slice(1).join('\n');

  return { numbered, label, body };
}

export function formatBlockMathWithMeta(meta: BlockMathMeta): string {
  const body = meta.body.replace(/\r\n/g, '\n');
  const label = meta.label.trim().replace(/[^A-Za-z0-9_.:-]/g, '');
  if (!meta.numbered && !label) {
    return body;
  }
  const tokens: string[] = [];
  if (meta.numbered) tokens.push('numbered');
  if (label) tokens.push(`label=${label}`);
  return `% softmath-eq: ${tokens.join(' ')}\n${body}`;
}

