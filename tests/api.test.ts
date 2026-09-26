import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import handler, { resetRateLimitsForTests } from '../api/index.ts';
import { extractUploadedText } from '../src/utils/extract.ts';

type CapturedResponse = { statusCode: number; body: unknown };

function request(method: string, url: string, body?: unknown, ip = '198.51.100.1') {
  return { method, url, body, headers: { 'x-forwarded-for': ip } };
}

async function invoke(req: ReturnType<typeof request>): Promise<CapturedResponse> {
  const captured: CapturedResponse = { statusCode: 200, body: null };
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(body: unknown) { captured.body = body; return body; },
  };
  await handler(req, res);
  return captured;
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  resetRateLimitsForTests();
});

test('health and sample routes respond without calling Gemini', async () => {
  assert.equal((await invoke(request('GET', '/api/health'))).statusCode, 200);
  const sample = await invoke(request('GET', '/api/sample'));
  assert.equal(sample.statusCode, 200);
  assert.ok((sample.body as { original: string }).original.includes('RENTAL AGREEMENT'));
});

test('unknown routes and unsupported methods have explicit statuses', async () => {
  assert.equal((await invoke(request('POST', '/api/nope', {}))).statusCode, 404);
  assert.equal((await invoke(request('GET', '/api/chat'))).statusCode, 405);
});

test('malformed and oversized JSON requests return 400 and 413', async () => {
  assert.equal((await invoke(request('POST', '/api/simplify', '{'))).statusCode, 400);
  assert.equal((await invoke(request('POST', '/api/simplify', { document_text: 'x'.repeat(1_000_001) }))).statusCode, 413);
});

test('required fields and document character limits are enforced', async () => {
  assert.equal((await invoke(request('POST', '/api/chat', { question: 'Rent?' }))).statusCode, 400);
  assert.equal((await invoke(request('POST', '/api/map', { document_text: 'x'.repeat(120_001) }))).statusCode, 413);
});

test('oversized uploads fail clearly instead of silently dropping later clauses', async () => {
  const upload = {
    name: 'large-contract.txt',
    size: 120_001,
    text: async () => 'x'.repeat(120_001),
  } as File;
  await assert.rejects(() => extractUploadedText(upload), /cannot be analyzed completely/);
});

test('public model endpoints apply a per-client request limit', async () => {
  resetRateLimitsForTests();
  for (let index = 0; index < 12; index += 1) {
    assert.notEqual((await invoke(request('POST', '/api/chat', {}, '203.0.113.4'))).statusCode, 429);
  }
  const limited = await invoke(request('POST', '/api/chat', {}, '203.0.113.4'));
  assert.equal(limited.statusCode, 429);
});

test('rate limiting uses the platform client IP and legal guardrail avoids weak keyword matches', async () => {
  resetRateLimitsForTests();
  for (let index = 0; index < 12; index += 1) {
    const req = request('POST', '/api/chat', {}, `untrusted-${index}`);
    req.headers['x-real-ip'] = '192.0.2.77';
    assert.notEqual((await invoke(req)).statusCode, 429);
  }
  const limited = request('POST', '/api/chat', {}, 'another-forwarded-address');
  limited.headers['x-real-ip'] = '192.0.2.77';
  assert.equal((await invoke(limited)).statusCode, 429);

  const unrelated = await invoke(request('POST', '/api/guardrail', { document_text: 'This article discusses the words contract and agreement in ordinary language.' }, '192.0.2.90'));
  assert.equal((unrelated.body as { is_legal: boolean }).is_legal, false);
  const lease = await invoke(request('POST', '/api/guardrail', { document_text: 'Lease agreement between landlord and tenant. Tenant shall pay rent each month.' }, '192.0.2.91'));
  assert.equal((lease.body as { is_legal: boolean }).is_legal, true);
});

test('analysis API enforces the legal-document gate without a separate client preflight', async () => {
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls += 1;
    return new Response('unexpected model call', { status: 500 });
  };
  const nonLegal = await invoke(request('POST', '/api/simplify', {
    document_text: 'This article discusses the words contract and agreement in ordinary language.',
  }, '192.0.2.92'));
  assert.equal(nonLegal.statusCode, 422);
  assert.equal(modelCalls, 0);

  const statute = await invoke(request('POST', '/api/guardrail', {
    document_text: 'Statute: pursuant to section 14, the court shall enforce this regulation under applicable law.',
  }, '192.0.2.93'));
  assert.equal(statute.statusCode, 200);
  assert.equal((statute.body as { is_legal: boolean }).is_legal, true);
});

test('Gemini receives retrieved chat context and versioned prompts', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let payload: Record<string, any> | undefined;
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'Rent is $900.', citations: ['Monthly rent is $900 due on the first day.'], advice_declined: false, confidence: 'high', evidence_type: 'directly_stated' }) }] } }] }), { status: 200 });
  };
  const document = [
    'Section 1. Monthly rent is $900 due on the first day. The tenant pays the landlord.',
    'Section 2. The tenant may keep one cat in the apartment with written permission.',
    'Section 3. Either party may end this agreement by giving 30 days of written notice.',
    'Section 4. The tenant must keep the property clean and report repairs promptly.',
    'Section 5. The landlord may enter with 24 hours of advance written notice.',
    'Section 6. The security deposit is refundable within 14 days after move-out.',
  ].join('\n\n');
  const result = await invoke(request('POST', '/api/chat', { question: 'How much is monthly rent?', document_text: document }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.body as any).citations, ['Monthly rent is $900 due on the first day.']);
  assert.equal((result.body as any).grounded, true);
  assert.ok(payload?.systemInstruction.parts[0].text.includes('TASK PROMPT — Follow-up Chat'));
  const input = JSON.parse(payload?.contents[0].parts[0].text || '{}');
  assert.equal(input.context_chunks.some((chunk: { text: string }) => chunk.text.includes('Monthly rent is $900')), true);
  assert.equal('document_text' in input, false);
});

test('chat retrieval bounds large paragraphs and excludes irrelevant chunks', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let receivedChunks: Array<{ text: string; char_start: number; char_end: number }> = [];
  const target = 'The municipal filing surcharge is exactly $75, payable once when the agreement is recorded.';
  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const modelInput = JSON.parse(requestBody.contents[0].parts[0].text) as { context_chunks: Array<{ text: string; char_start: number; char_end: number }> };
    receivedChunks = modelInput.context_chunks;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'The surcharge is $75.', citations: [target], advice_declined: false }) }] } }] }), { status: 200 });
  };

  const genericParagraph = `General tenant information and building maintenance rules apply throughout the rental agreement. ${'The tenant should keep shared spaces clean and report routine maintenance promptly. '.repeat(12)}`;
  const document = [...Array.from({ length: 90 }, () => genericParagraph), `${target} ${'Additional recording details apply to this administrative clause. '.repeat(12)}`].join('\n');
  const result = await invoke(request('POST', '/api/chat', { question: 'What is the municipal filing surcharge?', document_text: document }));

  assert.equal(result.statusCode, 200);
  const chunks = receivedChunks;
  assert.ok(chunks.length > 0 && chunks.length <= 5);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 1_800));
  assert.ok(chunks.reduce((total, chunk) => total + chunk.text.length, 0) <= 9_000);
  assert.ok(chunks.some((chunk) => chunk.text.includes(target)));
  assert.ok(chunks.every((chunk) => document.slice(chunk.char_start, chunk.char_end) === chunk.text));
});

test('chat retrieval sends no context when the document has no query match', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let receivedChunks: Array<{ text: string }> = [];
  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    receivedChunks = (JSON.parse(requestBody.contents[0].parts[0].text) as { context_chunks: Array<{ text: string }> }).context_chunks;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'The provided document does not contain that information.', citations: [], advice_declined: false }) }] } }] }), { status: 200 });
  };

  const result = await invoke(request('POST', '/api/chat', { question: 'What is the moonstone arbitration protocol?', document_text: 'The tenant pays rent on the first day of each month.' }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual(receivedChunks, []);
});

test('simplify, map, and compare return schema-checked results with grounded source evidence', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  const source = 'Section 1. Tenant pays monthly rent of $900 on the first day of each month.';
  const revised = 'Section 1. Tenant pays monthly rent of $950 on the first day of each month.';
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    const instructions = body.systemInstruction.parts[0].text as string;
    let value: unknown;
    if (instructions.includes('TASK PROMPT — Simplify')) value = { document_type: 'Lease', sections: [{ section_id: 'rent', original_heading: 'Section 1', plain_text: 'Rent is $900 each month.', source_span: source }], key_terms: [] };
    else if (instructions.includes('TASK PROMPT — Build Clause Map')) value = { document_type: 'Lease', clauses: [{ section_id: 'rent', heading: 'Rent', summary: 'Tenant pays $900 monthly.', risk_level: 'Medium', risk_category: 'Financial Risk', risk_reason: 'This is a recurring payment.', source_span: source, related_section_ids: [] }] };
    else value = { overall_assessment: 'The revised version raises monthly rent.', changes: [{ topic: 'Rent', change_type: 'modified', summary: 'Monthly rent increases by $50.', user_impact: 'The tenant pays $50 more per month.', impact_category: 'financial', materiality: 'material', source_span_a: source, source_span_b: revised }] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
  };

  const simplify = await invoke(request('POST', '/api/simplify', { document_text: source, reading_level: 'simple' }, '192.0.2.1'));
  assert.equal(simplify.statusCode, 200);
  assert.equal((simplify.body as any).sections[0].grounded, true);
  assert.equal((simplify.body as any).reading_level, 'simple');

  const map = await invoke(request('POST', '/api/map', { document_text: source }, '192.0.2.2'));
  assert.equal(map.statusCode, 200);
  assert.equal((map.body as any).clauses[0].grounded, true);

  const compare = await invoke(request('POST', '/api/compare', { document_a: source, document_b: revised }, '192.0.2.3'));
  assert.equal(compare.statusCode, 200);
  assert.equal((compare.body as any).changes[0].grounded_a, true);
  assert.equal((compare.body as any).changes[0].grounded_b, true);
});

test('unsupported Gemini citations are removed and the answer is marked for verification', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'The lease allows two cats.', citations: ['Tenant may keep two cats.'], advice_declined: false }) }] } }] }), { status: 200 });
  const result = await invoke(request('POST', '/api/chat', { question: 'How many cats?', document_text: 'The tenant may keep one cat with written permission.' }));
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.body as any).citations, []);
  assert.equal((result.body as any).grounded, false);
  assert.match((result.body as any).answer, /^Needs verification:/);
});

test('Gemini 429 retries only brief transient limits and explains exhausted daily quota', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Rate limited', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }] } }), { status: 429 });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'The rent is $900.', citations: ['The rent is $900 per month.'], advice_declined: false }) }] } }] }), { status: 200 });
  };
  const transient = await invoke(request('POST', '/api/chat', { question: 'What is the rent?', document_text: 'Lease agreement. The rent is $900 per month.' }, '192.0.2.31'));
  assert.equal(transient.statusCode, 200);
  assert.equal(attempts, 2);

  attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }), { status: 429 });
  };
  const exhausted = await invoke(request('POST', '/api/chat', { question: 'What is the rent?', document_text: 'Lease agreement. The rent is $900 per month.' }, '192.0.2.32'));
  assert.equal(exhausted.statusCode, 503);
  assert.match((exhausted.body as { error: string }).error, /daily quota/i);
  assert.match((exhausted.body as { error: string }).error, /same project share quota/i);
  assert.equal(attempts, 1);
});

test('Gemini outages and malformed model schemas return safe error responses', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  const unavailable = await invoke(request('POST', '/api/chat', { question: 'Rent?', document_text: 'Lease agreement. The rent is $900 per month.' }));
  assert.equal(unavailable.statusCode, 502);
  assert.deepEqual(unavailable.body, { error: 'AI service could not process this request. Please retry.' });

  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":42,"citations":[]}' }] } }] }), { status: 200 });
  const invalid = await invoke(request('POST', '/api/chat', { question: 'Rent?', document_text: 'Lease agreement. The rent is $900 per month.' }));
  assert.equal(invalid.statusCode, 502);
  assert.match((invalid.body as { error: string }).error, /required format/);
});
