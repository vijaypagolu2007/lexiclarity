import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { Sidebar } from './components/Sidebar';
import { DownloadButton } from './components/DownloadButton';
import { SimplifyTab } from './components/SimplifyTab';
import { ExplorerTab } from './components/ExplorerTab';
import { ClarifyTab } from './components/ClarifyTab';
import { CompareTab } from './components/CompareTab';
import { ChatTab } from './components/ChatTab';
import { LawyerPrepTab } from './components/LawyerPrepTab';
import { NegotiateTab } from './components/NegotiateTab';
import {
  BookOpen,
  Compass,
  Zap,
  GitCompare,
  MessageSquare,
  Briefcase,
  Handshake,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadActiveContent } from './utils/export';
import {
  SimplifyResult,
  ClauseItem,
  HealthScore,
  ClarifyResult,
  CompareResult,
  ChatMessage,
  LawyerPrepResult,
  NegotiationResult,
} from './types';

type TabId = 'simplify' | 'explorer' | 'clarify' | 'compare' | 'chat' | 'lawyer-prep' | 'negotiate';

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { id: 'simplify', label: 'Simplify', icon: BookOpen },
  { id: 'explorer', label: 'Clause Explorer', icon: Compass },
  { id: 'clarify', label: 'Clarify', icon: Zap },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'chat', label: 'Document Chat', icon: MessageSquare },
  { id: 'lawyer-prep', label: 'Lawyer Prep', icon: Briefcase },
  { id: 'negotiate', label: 'Negotiate', icon: Handshake },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('simplify');
  const [docText, setDocText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('sample_rental_agreement.txt');
  const [docBText, setDocBText] = useState<string>('');
  const [sampleOriginal, setSampleOriginal] = useState<string>('');
  const [sampleRevised, setSampleRevised] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isShowcase, setIsShowcase] = useState<boolean>(true);

  // Active processed state per tab for persistence and universal export
  const [simplifyResult, setSimplifyResult] = useState<SimplifyResult | null>(null);
  const [explorerData, setExplorerData] = useState<{ clauses: ClauseItem[]; health: HealthScore } | null>(null);
  const [clarifyResult, setClarifyResult] = useState<ClarifyResult | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lawyerPrepResult, setLawyerPrepResult] = useState<LawyerPrepResult | null>(null);
  const [negotiateResult, setNegotiateResult] = useState<NegotiationResult | null>(null);

  // Cross-tab interaction states
  const [initialClarifyClause, setInitialClarifyClause] = useState<string>('');
  const [initialNegotiateClause, setInitialNegotiateClause] = useState<string>('');

  useEffect(() => {
    // Check server health and fetch sample agreements
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(Boolean(data.hasApiKey));
      })
      .catch((err) => console.warn('Health check warning:', err));

    fetch('/api/sample')
      .then((res) => res.json())
      .then((data) => {
        if (data.original) {
          setSampleOriginal(data.original);
          setDocText(data.original);
          setFileName('sample_rental_agreement.txt');
        }
        if (data.revised) {
          setSampleRevised(data.revised);
          setDocBText(data.revised);
        }
      })
      .catch((err) => console.warn('Failed to load sample text:', err));
  }, []);

  const handleTextLoaded = (name: string, text: string) => {
    setFileName(name);
    setDocText(text);
    setIsShowcase(false);
    // Reset cached analysis on new doc upload
    setSimplifyResult(null);
    setExplorerData(null);
    setClarifyResult(null);
    setLawyerPrepResult(null);
    setNegotiateResult(null);
  };

  const handleLoadSample = () => {
    if (sampleOriginal) {
      setDocText(sampleOriginal);
      setFileName('sample_rental_agreement.txt');
      setIsShowcase(true);
      setSimplifyResult(null);
      setExplorerData(null);
      setClarifyResult(null);
      setLawyerPrepResult(null);
      setNegotiateResult(null);
    }
  };

  const handleLoadComparePair = () => {
    if (sampleOriginal && sampleRevised) {
      setDocText(sampleOriginal);
      setDocBText(sampleRevised);
      setFileName('sample_rental_agreement.txt');
      setActiveTab('compare');
      setIsShowcase(true);
    }
  };

  const handleNavigateToClarify = (clause: string) => {
    setInitialClarifyClause(clause);
    setActiveTab('clarify');
  };

  const handleNavigateToNegotiate = (clause: string) => {
    setInitialNegotiateClause(clause);
    setActiveTab('negotiate');
  };

  // Download handler for current active tab
  const handleDownload = (format: 'pdf' | 'txt' = 'pdf') => {
    downloadActiveContent(
      {
        activeTab,
        fileName,
        docText,
        docBText,
        simplifyResult,
        explorerResult: explorerData,
        clarifyResult,
        compareResult,
        chatMessages,
        lawyerPrepResult,
        negotiateResult,
      },
      format
    );
  };

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label || 'Document';

  // Split document into clauses for dropdown selection
  const extractedClauses = docText
    ? docText
        .split('\n\n')
        .map((c) => c.trim())
        .filter((c) => c.length > 25)
    : [];

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
        {/* Left Sidebar */}
        <Sidebar
          fileName={fileName}
          docText={docText}
          onTextLoaded={handleTextLoaded}
          onLoadSample={handleLoadSample}
          onLoadComparePair={handleLoadComparePair}
          isSampleActive={docText === sampleOriginal}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Navigation Tabs Bar & Workspace Download Action */}
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

            {/* Workspace Area Download Button */}
            <div className="hidden sm:flex items-center pb-2.5 flex-shrink-0">
              <DownloadButton
                onDownload={handleDownload}
                activeTabLabel={activeTabLabel}
                variant="workspace"
              />
            </div>
          </div>

          {/* Tab Workspace Panel */}
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
                    docText={docText}
                    onOpenDocPrompt={handleLoadSample}
                    result={simplifyResult}
                    onResultChange={setSimplifyResult}
                  />
                )}

                {activeTab === 'explorer' && (
                  <ExplorerTab
                    docText={docText}
                    onOpenDocPrompt={handleLoadSample}
                    onNavigateToClarify={handleNavigateToClarify}
                    onNavigateToNegotiate={handleNavigateToNegotiate}
                    data={explorerData}
                    onResultChange={setExplorerData}
                  />
                )}

                {activeTab === 'clarify' && (
                  <ClarifyTab
                    clauses={extractedClauses}
                    docText={docText}
                    initialClauseText={initialClarifyClause}
                    onOpenDocPrompt={handleLoadSample}
                    result={clarifyResult}
                    onResultChange={setClarifyResult}
                  />
                )}

                {activeTab === 'compare' && (
                  <CompareTab
                    initialDocA={docText}
                    initialDocB={docBText}
                    onLoadComparePair={handleLoadComparePair}
                    result={compareResult}
                    onResultChange={setCompareResult}
                  />
                )}

                {activeTab === 'chat' && (
                  <ChatTab
                    docText={docText}
                    onOpenDocPrompt={handleLoadSample}
                    messages={chatMessages}
                    onMessagesChange={setChatMessages}
                  />
                )}

                {activeTab === 'lawyer-prep' && (
                  <LawyerPrepTab
                    docText={docText}
                    onOpenDocPrompt={handleLoadSample}
                    result={lawyerPrepResult}
                    onResultChange={setLawyerPrepResult}
                  />
                )}

                {activeTab === 'negotiate' && (
                  <NegotiateTab
                    clauses={extractedClauses}
                    docText={docText}
                    initialClauseText={initialNegotiateClause}
                    onOpenDocPrompt={handleLoadSample}
                    result={negotiateResult}
                    onResultChange={setNegotiateResult}
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
