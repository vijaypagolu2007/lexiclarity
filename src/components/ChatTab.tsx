import React, { useState } from 'react';
import { ChatMessage } from '../types';
import { MessageSquare, Send, ShieldAlert, Sparkles, User, Bot, Trash2, ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { speakText, stopSpeaking } from '../utils/speech';

interface ChatTabProps {
  docText: string;
  onOpenDocPrompt: () => void;
  messages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

const SAMPLE_QUESTIONS = [
  'When can the landlord raise the rent?',
  'What is the security deposit and when do I get it back?',
  'Can I keep a pet dog or make alterations?',
  'Who is responsible for repairs and maintenance?',
];

export const ChatTab: React.FC<ChatTabProps> = ({
  docText,
  onOpenDocPrompt,
  messages: externalMessages,
  onMessagesChange,
}) => {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am LexiClarity. Ask me any question about your contract. I answer strictly based on the text of your document, citing exact supporting clauses.',
    },
  ]);

  const messages = externalMessages && externalMessages.length > 0 ? externalMessages : internalMessages;

  const setMessages = (updater: React.SetStateAction<ChatMessage[]>) => {
    setInternalMessages((prev) => {
      const current = externalMessages && externalMessages.length > 0 ? externalMessages : prev;
      const next = typeof updater === 'function' ? updater(current) : updater;
      onMessagesChange?.(next);
      return next;
    });
  };
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [activeVoiceLang, setActiveVoiceLang] = useState<string | null>(null);

  const handleSpeakMessage = (msgId: string, text: string) => {
    if (speakingMessageId === msgId) {
      stopSpeaking();
      setSpeakingMessageId(null);
      setActiveVoiceLang(null);
    } else {
      stopSpeaking();
      setSpeakingMessageId(msgId);
      const stopFn = speakText(
        text,
        'English',
        () => {
          setSpeakingMessageId(null);
          setActiveVoiceLang(null);
        },
        () => {
          setSpeakingMessageId(null);
          setActiveVoiceLang(null);
        }
      );
      if (stopFn.detectedLanguage) {
        setActiveVoiceLang(stopFn.detectedLanguage.langName);
      }
    }
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q) return;

    if (!docText) {
      onOpenDocPrompt();
      return;
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: q,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          document_text: docText,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to get answer');
      }

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: data.answer,
        citations: data.citations || [],
        advice_declined: data.advice_declined,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `Error answering question: ${err.message || 'Please check your connection and try again.'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCitation = (id: string) => {
    setExpandedCitations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Chat history cleared. Ask me any question about your uploaded document.',
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-700" />
            Grounded Contract Q&A
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Answers strictly grounded in document text with verbatim citations and legal advice guardrails.
          </p>
        </div>

        <button
          onClick={clearChat}
          className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-500 hover:text-stone-800 text-xs transition-colors flex items-center gap-1"
          title="Clear Chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-stone-500 font-medium">Quick Questions:</span>
        {SAMPLE_QUESTIONS.map((sq, i) => (
          <button
            key={i}
            onClick={() => handleSend(sq)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full bg-stone-100 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300 text-stone-700 border border-stone-200 text-xs transition-colors disabled:opacity-50 text-left"
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 h-[420px] overflow-y-auto space-y-4 shadow-xs">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isExpanded = expandedCitations[m.id];
          return (
            <div
              key={m.id}
              className={`flex gap-3 text-xs sm:text-sm ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-amber-700 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 space-y-2 shadow-2xs ${
                  isUser
                    ? 'bg-amber-700 text-white rounded-br-xs'
                    : 'bg-stone-50 border border-stone-200 text-stone-800 rounded-bl-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="leading-relaxed whitespace-pre-wrap font-sans flex-1">
                    {m.content}
                  </p>
                  {!isUser && (
                    <button
                      onClick={() => handleSpeakMessage(m.id, m.content)}
                      className={`p-1 rounded-md text-xs transition-colors flex-shrink-0 ${
                        speakingMessageId === m.id
                          ? 'bg-amber-600 text-white animate-pulse'
                          : 'text-stone-400 hover:text-amber-700 hover:bg-stone-200/60'
                      }`}
                      title={
                        speakingMessageId === m.id
                          ? `Stop reading (${activeVoiceLang || 'Auto-Voice'})`
                          : 'Listen (Auto-detect language voice)'
                      }
                    >
                      {speakingMessageId === m.id ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {m.advice_declined && (
                  <div className="p-2 rounded bg-amber-100/70 border border-amber-200 text-amber-900 text-xs flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                    <span>
                      Legal advice was declined. LexiClarity reports what the document states, not legal strategy.
                    </span>
                  </div>
                )}

                {/* Citation Drawer */}
                {m.citations && m.citations.length > 0 && (
                  <div className="pt-2 border-t border-stone-200/70">
                    <button
                      onClick={() => toggleCitation(m.id)}
                      className="text-[11px] text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1"
                    >
                      <span>{m.citations.length} Grounded Source Citation{m.citations.length > 1 ? 's' : ''}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-1.5">
                        {m.citations.map((c, idx) => (
                          <blockquote
                            key={idx}
                            className="text-xs italic text-stone-600 bg-white p-2.5 rounded border-l-2 border-amber-600 font-serif leading-relaxed"
                          >
                            "{c}"
                          </blockquote>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-stone-300 text-stone-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex gap-3 items-center text-xs text-stone-500 italic">
            <div className="w-7 h-7 rounded-lg bg-amber-700 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <span>Analyzing contract context and retrieving grounded citations...</span>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this contract (e.g., When can the landlord enter?)..."
          disabled={loading}
          className="flex-1 text-xs sm:text-sm text-stone-900 bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-amber-600 shadow-2xs"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
};
