export function normalizeTargetUrl(value: string): string {
  const trimmed = value.trim();
  const schemeMatches = [...trimmed.matchAll(/https?:\/\//gi)];
  if (schemeMatches.length < 2) return trimmed;

  const secondIndex = schemeMatches[1]?.index;
  if (!secondIndex) return trimmed;

  const firstPart = trimmed.slice(0, secondIndex);
  const secondPart = trimmed.slice(secondIndex);
  try {
    const first = new URL(firstPart);
    const second = new URL(secondPart);
    if (first.origin === second.origin) return first.href;
  } catch {
    // Keep the original value so normal URL validation can explain the issue.
  }
  return trimmed;
}
