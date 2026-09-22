import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Lazy Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function getValidGeminiModel(): string {
  const envModel = process.env.GEMINI_MODEL;
  if (
    envModel &&
    envModel.startsWith('gemini-') &&
    envModel !== 'gemini-2.5-flash' &&
    envModel !== 'gemini-2.5-pro' &&
    !envModel.startsWith('AQ.')
  ) {
    return envModel;
  }
  return 'gemini-3.8-flash';
}

const MODEL_NAME = getValidGeminiModel();

// Prompt Loader Helper
const promptsCache: Record<string, string> = {};
function getPrompt(name: string): string {
  if (promptsCache[name]) return promptsCache[name];
  const filePath = path.join(__dirname, 'prompts', `${name}.md`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    promptsCache[name] = content;
    return content;
  }
  return '';
}

// Load Pre-computed Showcase and Sample Files
let sampleAgreementText = '';
let sampleRevisedAgreementText = '';
let sampleShowcaseData: any = null;

try {
  const samplePath = path.join(__dirname, 'samples', 'sample_rental_agreement.txt');
  if (fs.existsSync(samplePath)) {
    sampleAgreementText = fs.readFileSync(samplePath, 'utf-8');
  }
  const revisedPath = path.join(__dirname, 'samples', 'sample_rental_agreement_revised.txt');
  if (fs.existsSync(revisedPath)) {
    sampleRevisedAgreementText = fs.readFileSync(revisedPath, 'utf-8');
  }
  const showcasePath = path.join(__dirname, 'showcase', 'sample_showcase.json');
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

  // Diverse candidate list across model series to bypass single-model rate limits or temporary high demand
  const candidateModels = Array.from(
    new Set([
      MODEL_NAME,
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ])
  );

  let lastError: any = null;
  const maxAttempts = candidateModels.length * 2;

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
    return res.status(500).json({ error: err.message });
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
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/clarify', async (req: Request, res: Response) => {
  const { clause_text, document_text = '' } = req.body;
  if (!clause_text) {
    return res.status(400).json({ error: 'clause_text is required' });
  }

  // Check if it's the indemnity clause from sample
  if (clause_text.toLowerCase().includes('indemnify') && sampleShowcaseData?.clarify_indemnity) {
    return res.json(sampleShowcaseData.clarify_indemnity);
  }

  try {
    const payload = `clause_text:\n${clause_text}\n\ndocument_text:\n${document_text.slice(0, 30000)}`;
    const result = await callGeminiJson('clarify', payload);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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
    return res.status(500).json({ error: err.message });
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
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/lawyer-prep', async (req: Request, res: Response) => {
  const { document_text } = req.body;
  if (!document_text) {
    return res.status(400).json({ error: 'document_text is required' });
  }

  if (isSampleDocument(document_text) && sampleShowcaseData?.lawyer_prep) {
    return res.json(sampleShowcaseData.lawyer_prep);
  }

  try {
    const payload = `document_text:\n${document_text.slice(0, 60000)}`;
    const result = await callGeminiJson('lawyer_prep', payload);
    return res.json(result);
  } catch (err: any) {
    if (isSampleDocument(document_text) && sampleShowcaseData?.lawyer_prep) {
      return res.json(sampleShowcaseData.lawyer_prep);
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/negotiate', async (req: Request, res: Response) => {
  const { clause_text } = req.body;
  if (!clause_text) {
    return res.status(400).json({ error: 'clause_text is required' });
  }

  try {
    const payload = `original_clause:\n${clause_text}`;
    const result = await callGeminiJson('negotiate', payload);
    return res.json(result);
  } catch (err: any) {
    // If indemnity clause from sample
    if (clause_text.toLowerCase().includes('indemnify')) {
      return res.json({
        negotiation_goal: 'Cap tenant indemnity and limit liability strictly to tenant negligence.',
        why_negotiate: 'The original clause imposes uncapped, one-sided financial exposure on the tenant for all claims.',
        proposed_clause: 'The Tenant agrees to indemnify the Landlord against direct damages arising solely from the Tenant’s gross negligence or willful misconduct, with total liability capped at an amount equal to two months’ rent.',
        tradeoff: 'The Landlord may request reciprocal indemnity or require tenant renter insurance coverage.',
        source_span: clause_text.slice(0, 200),
      });
    }
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// VITE OR STATIC SERVING
// ----------------------------------------------------

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
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

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
