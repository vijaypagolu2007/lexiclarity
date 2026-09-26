export type RetrievedChunk = { chunk_id: string; text: string; char_start: number; char_end: number };

const MAX_CHUNK_CHARS = 1_800;
const CHUNK_OVERLAP_CHARS = 160;
const DEFAULT_RETRIEVAL_LIMIT = 5;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'does', 'for', 'from', 'how', 'i', 'in',
  'is', 'it', 'of', 'on', 'or', 'our', 'the', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'you', 'your',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((token) => !STOP_WORDS.has(token));
}

function splitIntoChunks(document: string): RetrievedChunk[] {
  let cursor = 0;
  const chunks: RetrievedChunk[] = [];
  const paragraphs = document.split(/\n\s*\n+/);

  for (const paragraph of paragraphs) {
    const paragraphStart = document.indexOf(paragraph, cursor);
    if (paragraphStart < 0) continue;
    cursor = paragraphStart + paragraph.length;

    const leadingWhitespace = paragraph.length - paragraph.trimStart().length;
    const trailingWhitespace = paragraph.length - paragraph.trimEnd().length;
    let start = paragraphStart + leadingWhitespace;
    const end = paragraphStart + paragraph.length - trailingWhitespace;

    while (start < end) {
      let chunkEnd = Math.min(start + MAX_CHUNK_CHARS, end);
      if (chunkEnd < end) {
        const minBreak = start + Math.floor(MAX_CHUNK_CHARS * 0.65);
        const breakAt = Math.max(document.lastIndexOf(' ', chunkEnd), document.lastIndexOf('\n', chunkEnd));
        if (breakAt >= minBreak) chunkEnd = breakAt;
      }

      const rawText = document.slice(start, chunkEnd);
      const text = rawText.trim();
      const trimmedStart = rawText.length - rawText.trimStart().length;
      const trimmedEnd = rawText.length - rawText.trimEnd().length;
      if (text.length >= 30) {
        chunks.push({
          chunk_id: `chunk-${chunks.length + 1}`,
          text,
          char_start: start + trimmedStart,
          char_end: chunkEnd - trimmedEnd,
        });
      }

      if (chunkEnd >= end) break;
      start = Math.max(start + 1, chunkEnd - CHUNK_OVERLAP_CHARS);
    }
  }
  return chunks;
}

/** Return a bounded, relevance-ranked set of source-offset-preserving passages for document Q&A. */
export function retrieveChunks(query: string, document: string, limit = DEFAULT_RETRIEVAL_LIMIT): RetrievedChunk[] {
  const chunks = splitIntoChunks(document);
  const terms = new Set(tokenize(query));
  if (chunks.length === 0 || terms.size === 0 || limit <= 0) return [];

  const tokenLists = chunks.map((chunk) => tokenize(chunk.text));
  const documentFrequency = new Map<string, number>();
  const termFrequencies = tokenLists.map((tokens) => {
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    for (const term of terms) {
      if (frequencies.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
    return frequencies;
  });
  const averageLength = tokenLists.reduce((sum, tokens) => sum + tokens.length, 0) / chunks.length || 1;
  const k1 = 1.2;
  const b = 0.75;

  const ranked = chunks.map((chunk, index) => {
    const frequencies = termFrequencies[index];
    const length = tokenLists[index].length;
    let score = 0;
    for (const term of terms) {
      const frequency = frequencies.get(term) || 0;
      if (frequency === 0) continue;
      const frequencyAcrossChunks = documentFrequency.get(term) || 0;
      const inverseFrequency = Math.log(1 + (chunks.length - frequencyAcrossChunks + 0.5) / (frequencyAcrossChunks + 0.5));
      score += inverseFrequency * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * length / averageLength));
    }
    return { chunk, index, score };
  });

  if (!ranked.some(({ score }) => score > 0)) return [];
  return ranked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ chunk }) => chunk);
}
