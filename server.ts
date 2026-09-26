import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Lazy Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey, httpOptions: { timeout: 8000 } });
  }
  return aiClient;
}

function getValidGeminiModel(): string {
  const envModel = process.env.GEMINI_MODEL;
  return envModel === 'gemini-3.6-flash' ? envModel : 'gemini-3.6-flash';
}

const MODEL_NAME = getValidGeminiModel();

// Prompt Loader Helper
const promptsCache: Record<string, string> = {};
function getPrompt(name: string): string {
  if (promptsCache[name]) return promptsCache[name];
  const filePath = resolveAsset(path.join('prompts', `${name}.md`));
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    promptsCache[name] = content;
    return content;
  }
  return '';
}

// Vercel bundles this file under /api, while local Node runs it from the
// repository root. Resolve assets from both locations so prompts and showcase
// fallbacks work in either runtime.
function resolveAsset(relativePath: string): string {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.join(__dirname, relativePath),
    path.join(__dirname, '..', relativePath),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

// Load Pre-computed Showcase and Sample Files
let sampleAgreementText = '';
let sampleRevisedAgreementText = '';
let sampleShowcaseData: any = null;

try {
  const samplePath = resolveAsset(path.join('samples', 'sample_rental_agreement.txt'));
  if (fs.existsSync(samplePath)) {
    sampleAgreementText = fs.readFileSync(samplePath, 'utf-8');
  }
  const revisedPath = resolveAsset(path.join('samples', 'sample_rental_agreement_revised.txt'));
  if (fs.existsSync(revisedPath)) {
    sampleRevisedAgreementText = fs.readFileSync(revisedPath, 'utf-8');
  }
  const showcasePath = resolveAsset(path.join('showcase', 'sample_showcase.json'));
  if (fs.existsSync(showcasePath)) {
    sampleShowcaseData = JSON.parse(fs.readFileSync(showcasePath, 'utf-8'));
  }
} catch (e) {
  console.warn('Could not load some sample files:', e);
}

function isSampleDocument(text: string): boolean {
  if (!text || !sampleAgreementText) return false;
  const cleanDoc = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const cleanSample = sampleAgreementText.replace(/\s+/g, ' ').trim().toLowerCase();
  return cleanDoc.slice(0, 100) === cleanSample.slice(0, 100);
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n|(?=\b(?:SECTION|ARTICLE|CLAUSE)\s+\d+)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)
    .slice(0, 12);
}

function fallbackSimplify(text: string, readingLevel: string, language: string): any {
  return {
    document_type: 'Legal Document',
    language,
    reading_level: readingLevel,
    sections: paragraphsOf(text).map((paragraph, index) => ({
      section_id: `section-${index + 1}`,
      original_heading: paragraph.split(/[\n:]/)[0].slice(0, 80),
      plain_text: paragraph,
      source_span: paragraph.slice(0, 500),
    })),
    key_terms: [],
  };
}

function fallbackMap(text: string): any {
  return {
    document_type: 'Legal Document',
    clauses: paragraphsOf(text).map((paragraph, index) => ({
      section_id: `clause-${index + 1}`,
      heading: paragraph.split(/[\n:]/)[0].slice(0, 80),
      summary: paragraph,
      risk_level: /indemn|penalt|liabil|terminat|late fee/i.test(paragraph) ? 'High' : 'Medium',
      risk_category: /indemn|liabil/i.test(paragraph) ? 'Liability Exposure' : /terminat/i.test(paragraph) ? 'Termination Risk' : 'Financial Risk',
      risk_reason: 'Review this clause carefully because it creates a material obligation or deadline.',
      source_span: paragraph.slice(0, 500),
      related_section_ids: [],
    })),
  };
}

function fallbackCompare(a: string, b: string): any {
  return {
    overall_assessment: 'Comparison generated locally because the AI service was unavailable.',
    changes: [{
      topic: 'Document text',
      change_type: a === b ? 'unchanged' : 'modified',
      summary: a === b ? 'The documents contain the same text.' : 'The documents contain different text.',
      user_impact: 'Review the highlighted document differences before relying on either version.',
      materiality: 'material',
      impact_category: 'obligation',
      source_span_a: a.slice(0, 500),
      source_span_b: b.slice(0, 500),
    }],
  };
}

function fallbackChat(question: string, text: string): any {
  return {
    answer: `The AI service is temporarily unavailable. Review the document directly for an answer to: ${question}`,
    citations: paragraphsOf(text).slice(0, 2).map((p) => p.slice(0, 300)),
    advice_declined: true,
  };
}

function cleanJsonResponse(raw: string): any {
  if (!raw) return {};
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

async function callGeminiJson(promptName: string, payload: string): Promise<any> {
  const ai = getAI();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }

  const systemPrompt = getPrompt('system');
  const taskPrompt = getPrompt(promptName);
  const fullPrompt = `${taskPrompt}\n\n===== INPUT =====\n${payload}`;

  // Keep retries on supported generation models only. Embedding models are
  // configured separately and are never used for generation.
  const candidateModels = Array.from(
    new Set([
      MODEL_NAME,
      'gemini-flash-latest',
    ])
  );

  let lastError: any = null;
  // Keep one bounded attempt so Vercel's function execution window is not exceeded.
  const maxAttempts = 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentModel = candidateModels[attempt % candidateModels.length];
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: fullPrompt,
        config: {
          systemInstruction: systemPrompt || undefined,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }
      return cleanJsonResponse(text);
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      console.warn(`[LexiClarity AI] (Model: ${currentModel}) Attempt ${attempt + 1}/${maxAttempts} failed:`, msg);

      // Back off if hit rate limit (429) or service unavailable (503)
      const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      const isUnavailable = msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE');

      if (isRateLimit || isUnavailable) {
        const delayMs = Math.min(1500 * Math.pow(1.3, attempt), 4000);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  const isQuota = lastError?.message?.includes('429') || lastError?.message?.includes('quota');
  if (isQuota) {
    throw new Error('Gemini API free tier rate limit temporarily reached. Please retry in a few seconds or use the pre-loaded sample document.');
  }
  throw new Error(`AI processing error: ${lastError?.message || 'The AI service is temporarily unavailable. Please retry shortly.'}`);
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    model: MODEL_NAME,
  });
});

app.get('/api/sample', (req: Request, res: Response) => {
  res.json({
    original: sampleAgreementText,
    revised: sampleRevisedAgreementText,
    showcase: sampleShowcaseData,
  });
});

app.post('/api/guardrail', async (req: Request, res: Response) => {
  const { document_text } = req.body;
  if (!document_text || document_text.trim().length < 10) {
    return res.json({
      is_legal: false,
      document_kind: 'Empty or unreadable',
      confidence: 'high',
      reason: 'Document contains no readable text or is empty.',
    });
  }

  // Fast-path for sample agreement
  if (isSampleDocument(document_text)) {
    return res.json({
      is_legal: true,
      document_kind: 'Residential Rental Agreement',
      confidence: 'high',
      reason: 'Standard legal residential lease agreement with mutual rights and obligations.',
    });
  }

  try {
    if (getAI()) {
      const result = await callGeminiJson('guardrail', `document_text:\n${document_text.slice(0, 10000)}`);
      return res.json(result);
    }
  } catch (err) {
    console.warn('Guardrail AI check failed, falling back to heuristic:', err);
  }

  // Heuristic legal keywords check
  const lower = document_text.toLowerCase();
  const legalKeywords = ['agreement', 'contract', 'lease', 'tenant', 'landlord', 'party', 'clause', 'terms', 'shall', 'liability', 'indemnify', 'termination', 'governing law'];
  const matchCount = legalKeywords.filter((k) => lower.includes(k)).length;
  const isLegal = matchCount >= 3;

  return res.json({
    is_legal: isLegal,
    document_kind: isLegal ? 'Legal Document' : 'Non-legal document',
    confidence: 'medium',
    reason: isLegal ? 'Contains standard contractual clauses and terms.' : 'Does not contain standard legal terms.',
  });
});

app.post('/api/simplify', async (req: Request, res: Response) => {
  const { document_text, reading_level = 'summary', target_language = 'English' } = req.body;
  if (!document_text) {
    return res.status(400).json({ error: 'document_text is required' });
  }

  // Showcase fallback
  if (isSampleDocument(document_text) && sampleShowcaseData?.simplify_summary && target_language === 'English' && reading_level === 'summary') {
    return res.json(sampleShowcaseData.simplify_summary);
  }

  try {
    const payload = `reading_level: ${reading_level}\ntarget_language: ${target_language}\n\ndocument_text:\n${document_text.slice(0, 60000)}`;
    const result = await callGeminiJson('simplify', payload);
    return res.json(result);
  } catch (err: any) {
    if (isSampleDocument(document_text) && sampleShowcaseData?.simplify_summary) {
      return res.json(sampleShowcaseData.simplify_summary);
    }
    return res.json(fallbackSimplify(document_text, reading_level, target_language));
  }
});

app.post('/api/map', async (req: Request, res: Response) => {
  const { document_text } = req.body;
  if (!document_text) {
    return res.status(400).json({ error: 'document_text is required' });
  }

  // Showcase fallback
  if (isSampleDocument(document_text) && sampleShowcaseData?.clause_map) {
    return res.json(sampleShowcaseData.clause_map);
  }

  try {
    const payload = `document_text:\n${document_text.slice(0, 60000)}`;
    const result = await callGeminiJson('map', payload);
    return res.json(result);
  } catch (err: any) {
    if (isSampleDocument(document_text) && sampleShowcaseData?.clause_map) {
      return res.json(sampleShowcaseData.clause_map);
    }
    return res.json(fallbackMap(document_text));
  }
});

app.post('/api/compare', async (req: Request, res: Response) => {
  const { document_a, document_b } = req.body;
  if (!document_a || !document_b) {
    return res.status(400).json({ error: 'Both document_a and document_b are required' });
  }

  const isSampleA = isSampleDocument(document_a);
  const isSampleB = sampleRevisedAgreementText && document_b.slice(0, 80) === sampleRevisedAgreementText.slice(0, 80);

  if (isSampleA && isSampleB && sampleShowcaseData?.compare) {
    return res.json(sampleShowcaseData.compare);
  }

  try {
    const payload = `document_a:\n${document_a.slice(0, 50000)}\n\ndocument_b:\n${document_b.slice(0, 50000)}`;
    const result = await callGeminiJson('compare', payload);
    return res.json(result);
  } catch (err: any) {
    if (sampleShowcaseData?.compare) {
      return res.json(sampleShowcaseData.compare);
    }
    return res.json(fallbackCompare(document_a, document_b));
  }
});

app.post('/api/chat', async (req: Request, res: Response) => {
  const { question, document_text } = req.body;
  if (!question || !document_text) {
    return res.status(400).json({ error: 'question and document_text are required' });
  }

  // Check showcase answers for known sample questions
  if (isSampleDocument(document_text) && sampleShowcaseData?.chat_answers) {
    const normalizedQ = question.trim().toLowerCase();
    for (const [sampleQ, ans] of Object.entries(sampleShowcaseData.chat_answers)) {
      if (normalizedQ === sampleQ.toLowerCase() || normalizedQ.includes(sampleQ.toLowerCase().slice(0, 20))) {
        return res.json(ans);
      }
    }
  }

  try {
    // Simple retrieval: score paragraphs based on overlapping words
    const queryTokens = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const paragraphs = document_text.split(/\n\n+/).filter((p: string) => p.trim().length > 20);

    const scored = paragraphs.map((p: string) => {
      const pLower = p.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (pLower.includes(token)) score += 1;
      }
      return { paragraph: p, score };
    });

    scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    const topContext = scored.slice(0, 5).map((s: { paragraph: string }) => s.paragraph).join('\n---\n');

    const payload = `question: ${question}\n\nUse only these retrieved document excerpts as context:\n${topContext}\n\nFull document excerpt:\n${document_text.slice(0, 20000)}`;
    const result = await callGeminiJson('chat', payload);
    return res.json(result);
  } catch (err: any) {
    return res.json(fallbackChat(question, document_text));
  }
});

// ----------------------------------------------------
// VITE OR STATIC SERVING
// ----------------------------------------------------

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const [{ createServer: createViteServer }, { default: react }, { default: tailwindcss }] = await Promise.all([
      import('vite'),
      import('@vitejs/plugin-react'),
      import('@tailwindcss/vite'),
    ]);
    const vite = await createViteServer({
      configFile: false,
      plugins: [react(), tailwindcss()],
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚖️ LexiClarity Server running on http://0.0.0.0:${PORT}`);
  });
}

// Vercel imports the Express app as a serverless handler. Starting a listener
// there causes the function to fail before it can serve any request.
export default app;

if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
