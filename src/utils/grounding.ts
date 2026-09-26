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

  return doc.includes(sp);
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
