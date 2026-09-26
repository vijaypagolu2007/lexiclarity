const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;

export async function extractUploadedText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Files must be 10 MB or smaller.');
  }

  const extension = file.name.toLowerCase().split('.').pop() || '';
  let text: string;

  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result.value;
  } else if (extension === 'pdf') {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    text = pages.join('\n\n');
  } else if (['txt', 'md', 'json'].includes(extension) || !extension) {
    text = await file.text();
  } else {
    throw new Error(`Unsupported file type: .${extension}. Use PDF, DOCX, TXT, MD, or JSON.`);
  }

  const normalized = text.trim();
  if (!normalized) {
    throw new Error('This file contains no readable text. Scanned PDFs require OCR before upload.');
  }
  if (normalized.length > MAX_TEXT_CHARS) {
    throw new Error(`This document has more than ${MAX_TEXT_CHARS.toLocaleString()} characters and cannot be analyzed completely. Split it into smaller files so no clauses are silently skipped.`);
  }
  return normalized;
}
