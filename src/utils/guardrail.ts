import { GuardrailResult } from '../types';
import { readApiJson } from './api';

export async function requireLegalDocument(documentText: string): Promise<void> {
  const response = await fetch('/api/guardrail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_text: documentText }),
  });
  const result = await readApiJson<GuardrailResult>(response);
  if (!result.is_legal) {
    throw new Error(result.reason || 'This does not appear to be a legal document.');
  }
}
