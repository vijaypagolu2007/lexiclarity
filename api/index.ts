import fs from 'node:fs';
import path from 'node:path';

type AnyRequest = any;
type AnyResponse = any;
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function send(res: AnyResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function getPath(req: AnyRequest): string {
  const queryPath = req.query?.__path;
  if (typeof queryPath === 'string' && queryPath) return `/${queryPath.replace(/^\/+/, '')}`;
  return new URL(req.url || '/', 'http://localhost').pathname.replace(/^\/api/, '') || '/health';
}

async function getBody(req: AnyRequest): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    if (JSON.stringify(req.body).length > MAX_BODY_BYTES) throw new Error('Request body exceeds the 10 MB limit.');
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) throw new Error('Request body exceeds the 10 MB limit.');
    return JSON.parse(req.body);
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new Error('Request body exceeds the 10 MB limit.');
  }
  return raw ? JSON.parse(raw) : {};
}

function normalize(text: string): string {
  return text.replace(/[“”„«»]/g, '"').replace(/[‘’‚]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

function isGrounded(span: unknown, document: string): boolean {
  if (typeof span !== 'string' || !span.trim() || !document.trim()) return false;
  const source = normalize(document);
  const quote = normalize(span);
  if (source.includes(quote)) return true;
  const words = quote.split(' ');
  return [12, 8, 5].some((count) => words.length >= count && source.includes(words.slice(0, count).join(' ')));
}

function validateGrounding(result: any, document: string): any {
  if (Array.isArray(result?.sections)) {
    result.sections = result.sections.map((item: any) => ({ ...item, grounded: isGrounded(item.source_span, document) }));
  }
  if (Array.isArray(result?.clauses)) {
    result.clauses = result.clauses.map((item: any) => ({ ...item, grounded: isGrounded(item.source_span, document) }));
  }
  return result;
}

function validateComparison(result: any, first: string, second: string): any {
  if (Array.isArray(result?.changes)) {
    result.changes = result.changes.map((item: any) => ({
      ...item,
      grounded_a: item.source_span_a ? isGrounded(item.source_span_a, first) : undefined,
      grounded_b: item.source_span_b ? isGrounded(item.source_span_b, second) : undefined,
    }));
  }
  return result;
}

function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n|(?=\b(?:SECTION|ARTICLE|CLAUSE)\s+\d+)/i).map((p) => p.trim()).filter((p) => p.length > 20).slice(0, 12);
}

function fallbackSimplify(text: string, level: string, language: string) {
  const source = paragraphs(text);
  const selected = level === 'summary' ? source.slice(0, 5) : source;
  return { document_type: 'Legal Document', language, reading_level: level, sections: selected.map((p, i) => ({ section_id: `section-${i + 1}`, original_heading: p.split(/[\n:]/)[0].slice(0, 80), plain_text: level === 'summary' ? `• ${p.slice(0, 260)}` : level === 'simpler' ? `In simple words: ${p}` : `Plain-language version: ${p}`, source_span: p.slice(0, 500) })), key_terms: [] };
}

function fallbackMap(text: string) {
  return { document_type: 'Legal Document', clauses: paragraphs(text).map((p, i) => ({ section_id: `clause-${i + 1}`, heading: p.split(/[\n:]/)[0].slice(0, 80), summary: p, risk_level: /indemn|penalt|liabil|terminat|late fee/i.test(p) ? 'High' : 'Medium', risk_category: /indemn|liabil/i.test(p) ? 'Liability Exposure' : /terminat/i.test(p) ? 'Termination Risk' : 'Financial Risk', risk_reason: 'Review this clause carefully because it creates a material obligation or deadline.', source_span: p.slice(0, 500), related_section_ids: [] })) };
}

async function askGemini(instruction: string, input: string): Promise<any | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: `${instruction}\n\nINPUT:\n${input}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }) });
    if (!response.ok) return null;
    const json: any = await response.json();
    const raw = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('');
    return raw ? JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function loadFile(relative: string): string {
  try { return fs.readFileSync(path.join(process.cwd(), relative), 'utf8'); } catch { return ''; }
}

export default async function handler(req: AnyRequest, res: AnyResponse) {
  try {
    const route = getPath(req);
    if (req.method === 'GET' && route === '/health') return send(res, 200, { status: 'ok', hasApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), model });
    if (req.method === 'GET' && route === '/sample') return send(res, 200, { original: loadFile('samples/sample_rental_agreement.txt'), revised: loadFile('samples/sample_rental_agreement_revised.txt'), showcase: null });
    const body = await getBody(req);
    if (route === '/guardrail') { const text = String(body.document_text || ''); const legal = ['agreement', 'contract', 'lease', 'tenant', 'landlord', 'clause', 'shall', 'liability'].filter((k) => text.toLowerCase().includes(k)).length >= 2; return send(res, 200, { is_legal: legal, document_kind: legal ? 'Legal Document' : 'Non-legal document', confidence: 'medium', reason: legal ? 'Contains contractual language.' : 'Does not contain enough legal terms.' }); }
    if (route === '/simplify') { const text = String(body.document_text || ''); if (!text.trim()) return send(res, 400, { error: 'document_text is required' }); const level = String(body.reading_level || 'summary'); const language = 'English'; const levelRules = level === 'simple' ? 'Use everyday adult language, short sentences, and explain legal terms.' : level === 'simpler' ? 'Use very short child-friendly sentences, simple vocabulary, and brief explanations as if explaining to a 10-year-old.' : 'Write a concise executive summary with no more than 5 sections covering parties, money, duration, termination, and the riskiest obligation.'; const result = await askGemini(`Simplify this legal document into valid JSON with document_type, language, reading_level, sections, and key_terms. The selected reading level is ${level}. ${levelRules} Write every explanatory field in English and keep original_heading and source_span exactly as written in the source document.`, `reading_level: ${level}\ndocument_text:\n${text.slice(0, 50000)}`); return send(res, 200, validateGrounding(result ? { ...result, language, reading_level: level } : fallbackSimplify(text, level, language), text)); }
    if (route === '/map') { const text = String(body.document_text || ''); if (!text.trim()) return send(res, 400, { error: 'document_text is required' }); const result = await askGemini('Map this legal document into valid JSON with document_type and clauses. Each clause needs section_id, heading, summary, risk_level, risk_category, risk_reason, source_span, and related_section_ids.', text.slice(0, 50000)); return send(res, 200, validateGrounding(result || fallbackMap(text), text)); }
    if (route === '/compare') { const a = String(body.document_a || ''), b = String(body.document_b || ''); if (!a.trim() || !b.trim()) return send(res, 400, { error: 'Both document_a and document_b are required' }); const result = await askGemini('Compare these two legal documents into valid JSON with overall_assessment and changes.', `DOCUMENT A:\n${a.slice(0, 40000)}\nDOCUMENT B:\n${b.slice(0, 40000)}`); return send(res, 200, validateComparison(result || { overall_assessment: 'Documents contain different text.', changes: [{ topic: 'Document text', change_type: a === b ? 'unchanged' : 'modified', summary: 'Review the differences between the documents.', user_impact: 'Check changed obligations and dates.', materiality: 'material' }] }, a, b)); }
    if (route === '/chat') { const question = String(body.question || ''), text = String(body.document_text || ''); if (!question.trim() || !text.trim()) return send(res, 400, { error: 'question and document_text are required' }); const result = await askGemini('Answer the question using only the legal document. Return valid JSON with answer, citations, and advice_declined.', `QUESTION: ${question}\nDOCUMENT:\n${text.slice(0, 30000)}`); return send(res, 200, result || { answer: `The AI service is temporarily unavailable. Please review the document for: ${question}`, citations: paragraphs(text).slice(0, 2), advice_declined: true, fallback: true }); }
    return send(res, 404, { error: 'API route not found' });
  } catch (error: any) { console.error('[LexiClarity] handler error', error); return send(res, 500, { error: error?.message || 'Request failed' }); }
}
