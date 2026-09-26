import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';
import { Sidebar } from '../src/components/Sidebar';
import { keepTabFocusInside } from '../src/utils/accessibility';

test('main navigation renders a labeled keyboard-operable tab interface', () => {
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /role="tablist" aria-label="Document tools"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="panel-document-tools"/);
  assert.match(html, /id="panel-document-tools" role="tabpanel" aria-labelledby="tab-simplify" tabindex="0"/);
});

test('upload and document selection render native labeled controls', () => {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    docsLibrary: [{ id: 'sample_original', name: 'sample_rental_agreement.txt', text: 'Agreement', wordCount: 1, clauseCount: 1 }],
    activeDocId: 'sample_original',
    onSelectActiveDoc: () => undefined,
    onUploadDocs: () => undefined,
    onLoadSample: () => undefined,
    onLoadComparePair: () => undefined,
    onRemoveDoc: () => undefined,
    onClearDocs: () => undefined,
  }));
  assert.match(html, /aria-labelledby="upload-documents-label"/);
  assert.match(html, /aria-describedby="upload-documents-help"/);
  assert.match(html, /aria-label="Current document: sample_rental_agreement.txt"/);
  assert.match(html, /document text is sent to Google Gemini for processing/i);
});

test('modal keyboard focus wraps at both ends of its controls', () => {
  const first = { focus() {}, getAttribute: () => null } as unknown as HTMLElement;
  let lastFocused = false;
  const last = { focus() { lastFocused = true; }, getAttribute: () => null } as unknown as HTMLElement;
  const dialog = {
    querySelectorAll: () => [first, last],
    contains: () => true,
    focus() {},
  } as unknown as HTMLElement;
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: first } });
  let prevented = false;
  keepTabFocusInside({ key: 'Tab', shiftKey: true, currentTarget: dialog, preventDefault: () => { prevented = true; } } as never);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  assert.equal(prevented, true);
  assert.equal(lastFocused, true);
});
