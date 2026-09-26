import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import handler, { resetRateLimitsForTests } from '../api/index.ts';

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

test('public model endpoints apply a per-client request limit', async () => {
  resetRateLimitsForTests();
  for (let index = 0; index < 12; index += 1) {
    assert.notEqual((await invoke(request('POST', '/api/chat', {}, '203.0.113.4'))).statusCode, 429);
  }
  const limited = await invoke(request('POST', '/api/chat', {}, '203.0.113.4'));
  assert.equal(limited.statusCode, 429);
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

test('Gemini outages and malformed model schemas return safe error responses', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  const unavailable = await invoke(request('POST', '/api/chat', { question: 'Rent?', document_text: 'The rent is $900 per month.' }));
  assert.equal(unavailable.statusCode, 502);
  assert.deepEqual(unavailable.body, { error: 'AI service could not process this request. Please retry.' });

  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":42,"citations":[]}' }] } }] }), { status: 200 });
  const invalid = await invoke(request('POST', '/api/chat', { question: 'Rent?', document_text: 'The rent is $900 per month.' }));
  assert.equal(invalid.statusCode, 502);
  assert.match((invalid.body as { error: string }).error, /required format/);
});
