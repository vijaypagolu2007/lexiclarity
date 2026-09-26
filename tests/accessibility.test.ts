import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';
import { Sidebar } from '../src/components/Sidebar';

test('main navigation renders a labeled keyboard-operable tab interface', () => {
  const html = renderToStaticMarkup(React.createElement(App));
  assert.match(html, /role="tablist" aria-label="Document tools"/);
  assert.match(html, /role="tab" aria-selected="true" aria-controls="panel-simplify"/);
  assert.match(html, /role="tabpanel" aria-labelledby="tab-simplify" tabindex="0"/);
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
});
