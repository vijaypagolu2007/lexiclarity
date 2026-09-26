import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { Sidebar } from './components/Sidebar';
import { SimplifyTab } from './components/SimplifyTab';
import { ExplorerTab } from './components/ExplorerTab';
import { CompareTab } from './components/CompareTab';
import { ChatTab } from './components/ChatTab';
import { BookOpen, Compass, GitCompare, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadActiveContent } from './utils/export';
import { extractUploadedText } from './utils/extract';
import {
  SimplifyResult,
  ClauseItem,
  HealthScore,
  CompareResult,
  ChatMessage,
  LoadedDocument,
} from './types';

type TabId = 'simplify' | 'explorer' | 'compare' | 'chat';

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { id: 'simplify', label: 'Simplify', icon: BookOpen },
  { id: 'explorer', label: 'Clause Explorer', icon: Compass },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'chat', label: 'Document Chat', icon: MessageSquare },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('simplify');
  const [docsLibrary, setDocsLibrary] = useState<LoadedDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [compareDocAId, setCompareDocAId] = useState<string>('');
  const [compareDocBId, setCompareDocBId] = useState<string>('');

  const [sampleOriginal, setSampleOriginal] = useState<string>('');
  const [sampleRevised, setSampleRevised] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isShowcase, setIsShowcase] = useState<boolean>(true);

  // Active processed state per tab
  const [simplifyResult, setSimplifyResult] = useState<SimplifyResult | null>(null);
  const [explorerData, setExplorerData] = useState<{ clauses: ClauseItem[]; health: HealthScore } | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHasApiKey(Boolean(data.hasApiKey)))
      .catch((err) => console.warn('Health check warning:', err));

    fetch('/api/sample')
      .then((res) => res.json())
      .then((data) => {
        if (data.original) {
          setSampleOriginal(data.original);
          setSampleRevised(data.revised || '');

          const doc1: LoadedDocument = {
            id: 'sample_original',
            name: 'sample_rental_agreement.txt',
            text: data.original,
            wordCount: data.original.trim().split(/\s+/).length,
            clauseCount: data.original.split('\n\n').filter((c: string) => c.trim().length > 30).length,
          };

          const doc2: LoadedDocument = {
            id: 'sample_revised',
            name: 'sample_rental_agreement_revised.txt',
            text: data.revised || data.original,
            wordCount: (data.revised || data.original).trim().split(/\s+/).length,
            clauseCount: (data.revised || data.original).split('\n\n').filter((c: string) => c.trim().length > 30).length,
          };

          setDocsLibrary((prev) => {
            const userDocs = prev.filter((doc) => !doc.id.startsWith('sample_'));
            return [doc1, doc2, ...userDocs];
          });
          setActiveDocId((current) => current || doc1.id);
          setCompareDocAId((current) => current || doc1.id);
          setCompareDocBId((current) => current || doc2.id);
        }
      })
      .catch((err) => console.warn('Failed to load sample text:', err));
  }, []);

  // Multi-upload handler populating central docsLibrary
  const handleUploadDocs = async (files: File[]) => {
    const newDocs: LoadedDocument[] = [];
    setUploadError(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let text = '';
      try {
        text = await extractUploadedText(file);
      } catch (error) {
        setUploadError(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: Unable to read file.`);
        continue;
      }

      if (text) {
        newDocs.push({
          id: `doc_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          text,
          wordCount: text.trim().split(/\s+/).length,
          clauseCount: text.split('\n\n').filter((c) => c.trim().length > 30).length,
          uploadedAt: Date.now(),
          sourceUrl: file.type === 'application/pdf' ? URL.createObjectURL(file) : undefined,
          mimeType: file.type || undefined,
        });
      }
    }

    if (newDocs.length > 0) {
      setDocsLibrary((prev) => [...newDocs, ...prev]);
      setActiveDocId(newDocs[0].id);
      setIsShowcase(false);
      setSimplifyResult(null);
      setExplorerData(null);
      setCompareResult(null);
    }
  };

  const handleSelectActiveDoc = (id: string) => {
    setActiveDocId(id);
    setSimplifyResult(null);
    setExplorerData(null);
  };

  const handleRemoveDoc = (id: string) => {
    setDocsLibrary((prev) => {
      const removed = prev.find((d) => d.id === id);
      if (removed?.sourceUrl) URL.revokeObjectURL(removed.sourceUrl);
      const filtered = prev.filter((d) => d.id !== id);
      setActiveDocId(activeDocId === id ? filtered[0]?.id || '' : activeDocId);
      return filtered;
    });
  };

  const handleClearDocs = () => {
    docsLibrary.forEach((doc) => doc.sourceUrl && URL.revokeObjectURL(doc.sourceUrl));
    setDocsLibrary([]);
    setActiveDocId('');
    setCompareDocAId('');
    setCompareDocBId('');
    setSimplifyResult(null);
    setExplorerData(null);
    setCompareResult(null);
    setChatMessages([]);
    setIsShowcase(false);
  };

  const buildSampleDocs = (): LoadedDocument[] => {
    if (!sampleOriginal) return [];
    return [
      {
        id: 'sample_original',
        name: 'sample_rental_agreement.txt',
        text: sampleOriginal,
        wordCount: sampleOriginal.trim().split(/\s+/).length,
        clauseCount: sampleOriginal.split('\n\n').filter((c) => c.trim().length > 30).length,
      },
      {
        id: 'sample_revised',
        name: 'sample_rental_agreement_revised.txt',
        text: sampleRevised || sampleOriginal,
        wordCount: (sampleRevised || sampleOriginal).trim().split(/\s+/).length,
        clauseCount: (sampleRevised || sampleOriginal).split('\n\n').filter((c) => c.trim().length > 30).length,
      },
    ];
  };

  const handleLoadSample = () => {
    const sampleDocs = buildSampleDocs();
    const sampleDoc = docsLibrary.find((d) => d.id === 'sample_original') || sampleDocs[0];
    if (sampleDoc) {
      setDocsLibrary((prev) => {
        const withoutSamples = prev.filter((d) => !d.id.startsWith('sample_'));
        return [...sampleDocs, ...withoutSamples];
      });
      setActiveDocId(sampleDoc.id);
      setCompareDocAId('sample_original');
      setCompareDocBId('sample_revised');
      setIsShowcase(true);
      setSimplifyResult(null);
      setExplorerData(null);
    }
  };

  const handleLoadComparePair = () => {
    const sampleDocs = buildSampleDocs();
    if (sampleDocs.length) {
      setDocsLibrary((prev) => [...sampleDocs, ...prev.filter((d) => !d.id.startsWith('sample_'))]);
    }
    setCompareDocAId('sample_original');
    setCompareDocBId('sample_revised');
    setActiveTab('compare');
    setIsShowcase(true);
  };

  const activeDoc = docsLibrary.find((d) => d.id === activeDocId) || docsLibrary[0];
  const activeDocText = activeDoc?.text || '';
  const activeFileName = activeDoc?.name || 'Document';

  const docAObj = docsLibrary.find((d) => d.id === compareDocAId) || docsLibrary[0];
  const docBObj = docsLibrary.find((d) => d.id === compareDocBId) || docsLibrary[1] || docsLibrary[0];

  const handleDownload = (format: 'pdf' | 'txt' = 'pdf') => {
    downloadActiveContent(
      {
        activeTab,
        fileName: activeFileName,
        docText: activeDocText,
        docBText: docBObj?.text || '',
        simplifyResult,
        explorerResult: explorerData,
        compareResult,
        chatMessages,
      },
      format
    );
  };

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label || 'Document';

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col text-stone-900 selection:bg-amber-100 selection:text-amber-900">
      <Header
        hasApiKey={hasApiKey}
        isShowcase={isShowcase}
        activeTabLabel={activeTabLabel}
        onDownload={handleDownload}
      />
      <DisclaimerBanner />

      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto shadow-xs border-x border-stone-200 bg-white">
        {/* Unified Application Document Library Sidebar */}
        <Sidebar
          docsLibrary={docsLibrary}
          activeDocId={activeDocId}
          onSelectActiveDoc={handleSelectActiveDoc}
          onUploadDocs={handleUploadDocs}
          onLoadSample={handleLoadSample}
          onLoadComparePair={handleLoadComparePair}
          onRemoveDoc={handleRemoveDoc}
          onClearDocs={handleClearDocs}
        />
        {uploadError && (
          <div role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {uploadError}
          </div>
        )}

        {/* Main Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="border-b border-stone-200 bg-stone-50/60 px-4 sm:px-6 pt-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
            <nav className="flex space-x-1 sm:space-x-2 min-w-max pb-2.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all select-none ${
                      isActive
                        ? 'bg-amber-700 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 p-4 sm:p-6 lg:p-8 bg-white min-h-[500px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'simplify' && (
                  <SimplifyTab
                    docText={activeDocText}
                    sourceUrl={activeDoc?.sourceUrl}
                    onOpenDocPrompt={handleLoadSample}
                    result={simplifyResult}
                    onResultChange={setSimplifyResult}
                  />
                )}

                {activeTab === 'explorer' && (
                  <ExplorerTab
                    docText={activeDocText}
                    sourceUrl={activeDoc?.sourceUrl}
                    onOpenDocPrompt={handleLoadSample}
                    data={explorerData}
                    onResultChange={setExplorerData}
                  />
                )}

                {activeTab === 'compare' && (
                  <CompareTab
                    docsLibrary={docsLibrary}
                    compareDocAId={compareDocAId}
                    compareDocBId={compareDocBId}
                    onSelectDocA={setCompareDocAId}
                    onSelectDocB={setCompareDocBId}
                    onLoadComparePair={handleLoadComparePair}
                    onUploadDocs={handleUploadDocs}
                    result={compareResult}
                    onResultChange={setCompareResult}
                  />
                )}

                {activeTab === 'chat' && (
                  <ChatTab
                    docText={activeDocText}
                    onOpenDocPrompt={handleLoadSample}
                    messages={chatMessages}
                    onMessagesChange={setChatMessages}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
