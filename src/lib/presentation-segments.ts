const STRONG_BOUNDARIES = new Set(["。", "；", "！", "？", ".", ";", "!", "?"]);
const SOFT_BOUNDARIES = new Set(["，", "、", ","]);

function isStrongBoundary(text: string, index: number): boolean {
  const character = text[index]!;
  if (!STRONG_BOUNDARIES.has(character)) return false;
  if (character !== ".") return true;

  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return !(/[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(next));
}

function includeFollowingWhitespace(text: string, index: number): number {
  let end = index;
  while (end < text.length && /\s/.test(text[end]!)) end += 1;
  return end;
}

function splitAfterStrongBoundaries(text: string): string[] {
  const segments: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isStrongBoundary(text, index)) continue;
    const end = includeFollowingWhitespace(text, index + 1);
    segments.push(text.slice(start, end));
    start = end;
    index = end - 1;
  }

  if (start < text.length) segments.push(text.slice(start));
  return segments;
}

function findBreak(
  text: string,
  start: number,
  threshold: number,
  isBoundary: (character: string) => boolean,
): number | undefined {
  const minimumChunk = Math.max(12, Math.floor(threshold * 0.55));
  const preferredEnd = Math.min(text.length, start + threshold);

  for (let index = preferredEnd - 1; index >= start + minimumChunk; index -= 1) {
    if (isBoundary(text[index]!)) return includeFollowingWhitespace(text, index + 1);
  }

  const extendedEnd = Math.min(text.length, start + Math.floor(threshold * 1.5));
  for (let index = preferredEnd; index < extendedEnd; index += 1) {
    if (isBoundary(text[index]!)) return includeFollowingWhitespace(text, index + 1);
  }

  return undefined;
}

function splitLongSegment(text: string, threshold: number): string[] {
  if (text.length <= threshold) return [text];

  const segments: string[] = [];
  let start = 0;

  while (text.length - start > threshold) {
    const punctuationBreak = findBreak(text, start, threshold, (character) => SOFT_BOUNDARIES.has(character));
    const whitespaceBreak = punctuationBreak
      ?? findBreak(text, start, threshold, (character) => /\s/.test(character));
    if (whitespaceBreak === undefined || whitespaceBreak <= start) break;
    segments.push(text.slice(start, whitespaceBreak));
    start = whitespaceBreak;
  }

  if (start < text.length) segments.push(text.slice(start));
  return segments.length ? segments : [text];
}

export function segmentPreservingText(text: string, threshold = 96): string[] {
  if (text.length <= threshold) return [text];

  const segments = splitAfterStrongBoundaries(text)
    .flatMap((segment) => splitLongSegment(segment, threshold))
    .filter((segment) => segment.length > 0);

  // The presentation layer must never rewrite report content.
  return segments.join("") === text ? segments : [text];
}
