import { GuardrailResult } from '../types';

export async function requireLegalDocument(documentText: string): Promise<void> {
  const response = await fetch('/api/guardrail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_text: documentText }),
  });
  const result = (await response.json()) as GuardrailResult;
  if (!response.ok || !result.is_legal) {
    throw new Error(result.reason || 'This does not appear to be a legal document.');
  }
}
