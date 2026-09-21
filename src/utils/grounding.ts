const UNICODE_EQUIV: Record<string, string> = {
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '—': '-',
  '–': '-',
  '―': '-',
  '\u00A0': ' ',
  '\u2009': ' ',
  '\u200B': '',
  '…': '...',
};

export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  let text = s;
  for (const [src, dst] of Object.entries(UNICODE_EQUIV)) {
    text = text.replaceAll(src, dst);
  }
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function spanInDocument(span: string | null | undefined, document: string): boolean {
  if (!span) return false;
  const doc = normalizeText(document);
  const sp = normalizeText(span);
  if (!sp || !doc) return false;

  if (doc.includes(sp)) {
    return true;
  }

  // Tolerate minor truncation: accept if an 8- or 5-word prefix of the span matches
  const words = sp.split(' ');
  for (const n of [12, 8, 5]) {
    if (words.length >= n) {
      const prefix = words.slice(0, n).join(' ');
      if (doc.includes(prefix)) {
        return true;
      }
    }
  }

  return false;
}

export function checkItems<T extends { source_span?: string; grounded?: boolean }>(
  items: T[],
  document: string
): (T & { grounded: boolean })[] {
  return items.map((item) => ({
    ...item,
    grounded: spanInDocument(item.source_span, document),
  }));
}

export function groundedRate(items: { grounded?: boolean }[]): number {
  if (!items || items.length === 0) return 1.0;
  const groundedCount = items.filter((i) => i.grounded).length;
  return groundedCount / items.length;
}
