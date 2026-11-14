export interface StripExamSolutionsOptions {
  /** Keep an empty fillable proof prompt instead of removing the proof block completely. */
  proofPlaceholder?: string;
}

const CORRECTION_HEADING_RE =
  /^(#{1,6})\s+(?:correction|corrig[ée]s?|solutions?|r[ée]ponses?|[ée]l[ée]ments\s+de\s+r[ée]ponse)\b/i;

/**
 * Strips proofs and "Correction / Solution" sections from a Markdown note
 * so Exam Mode previews, prints, and .tex exports show only the problem statements.
 */
export function stripExamSolutionsFromMarkdown(
  markdown: string,
  options: StripExamSolutionsOptions = {}
): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  let inCodeFence = false;
  let skippingHeadingLevel: number | null = null;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (skippingHeadingLevel === null) {
        inCodeFence = !inCodeFence;
        out.push(line);
      } else {
        inCodeFence = !inCodeFence;
      }
      i += 1;
      continue;
    }

    if (inCodeFence) {
      if (skippingHeadingLevel === null) {
        out.push(line);
      }
      i += 1;
      continue;
    }

    // Check headings when not inside code fence
    const anyHeading = trimmed.match(/^(#{1,6})\s+/);
    if (anyHeading) {
      const level = anyHeading[1].length;
      if (skippingHeadingLevel !== null && level <= skippingHeadingLevel) {
        skippingHeadingLevel = null;
      }
      if (skippingHeadingLevel === null && CORRECTION_HEADING_RE.test(trimmed)) {
        // Also remove a directly preceding horizontal rule separator if present
        while (out.length > 0 && out[out.length - 1].trim() === '') {
          out.pop();
        }
        if (
          out.length > 0 &&
          /^(?:-{3,}|\*{3,}|_{3,})$/.test(out[out.length - 1].trim())
        ) {
          out.pop();
        }
        skippingHeadingLevel = level;
        i += 1;
        continue;
      }
    }

    if (skippingHeadingLevel !== null) {
      i += 1;
      continue;
    }

    // Check :::proof blocks
    const proofMatch = trimmed.match(/^:::proof(?:\{collapsed\})?(?:\s+(.*))?$/);
    if (proofMatch) {
      let depth = 1;
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        const inner = lines[j].trim();
        if (
          /^:::(definition|theorem|proof|example|exercise)(?:\{collapsed\})?(?:\s+.*)?$/.test(
            inner
          )
        ) {
          depth += 1;
        } else if (inner === ':::') {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        j += 1;
      }
      if (options.proofPlaceholder) {
        out.push(options.proofPlaceholder);
      }
      i = j + 1;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n').replace(/\n{3,}$/g, '\n\n').trimEnd();
}

