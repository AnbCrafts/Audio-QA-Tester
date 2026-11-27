import React, { useState, useRef, useEffect } from 'react';
import {
  MessagesSquare,
  Search,
  User,
  Filter,
  Sparkles,
  Volume2,
  Edit2,
  Check,
  X,
  Download,
  Copy,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { TranscriptSegment } from '../types';

interface TranscriptViewerProps {
  transcript: TranscriptSegment[];
  onSeekAudio?: (seconds: number) => void;
  activeSegmentId?: string | null;
  onUpdateSegment?: (id: string, newText: string, newSpeaker: string) => void;
  evidenceQuotes?: Array<{ quote: string; timestamp?: string }>;
  actionItems?: Array<{ evidenceQuote: string; timestamp?: string | null }>;
  toneRating?: 'GREEN' | 'RED';
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  onSeekAudio,
  activeSegmentId,
  onUpdateSegment,
  evidenceQuotes = [],
  actionItems = [],
  toneRating = 'GREEN',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpeaker, setFilterSpeaker] = useState<'all' | 'rep' | 'customer'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('Sales Rep');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when a new transcript is loaded
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [transcript]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const filteredSegments = transcript.filter((seg) => {
    const matchesSearch =
      seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterSpeaker === 'rep') return seg.isRep;
    if (filterSpeaker === 'customer') return !seg.isRep;
    return true;
  });

  const startEditing = (seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
    setEditSpeaker(seg.speaker);
  };

  const saveEdit = (id: string) => {
    if (onUpdateSegment && editText.trim()) {
      onUpdateSegment(id, editText.trim(), editSpeaker);
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleCopyTranscript = () => {
    const fullText = transcript
      .map((s, idx) => `[Turn ${idx + 1} | ${s.timestamp}] ${s.speaker}: ${s.text}`)
      .join('\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTranscript = () => {
    const fullText = transcript
      .map((s, idx) => `[Turn ${idx + 1} | ${s.timestamp}] ${s.speaker}: ${s.text}`)
      .join('\n');
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`rounded-2xl border border-subtle bg-surface p-6 shadow-sm flex flex-col transition-all ${
        isExpanded ? 'min-h-[850px]' : 'h-[650px]'
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-extrabold text-ink flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-accent" />
              Full Call Transcript ({transcript.length} Turns)
            </h3>
            <span className="rounded-full bg-status-green-soft px-2 py-0.5 text-[10px] font-mono font-bold text-status-green border border-status-green/30">
              Complete Conversation
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            Scroll to browse all turns from 00:00 to end. Click edit icon to persist human corrections.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-canvas rounded-lg border border-subtle p-0.5">
            <button
              type="button"
              onClick={scrollToTop}
              className="p-1.5 text-ink-muted hover:text-accent hover:bg-surface rounded transition-colors cursor-pointer"
              title="Scroll to Top (00:00)"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={scrollToBottom}
              className="p-1.5 text-ink-muted hover:text-accent hover:bg-surface rounded transition-colors cursor-pointer"
              title="Scroll to Bottom"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-accent border border-subtle transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Expand</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyTranscript}
            className="flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-accent border border-subtle transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTranscript}
            className="flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-accent border border-subtle transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Search & Speaker Filter Bar */}
      <div className="flex items-center justify-between gap-3 pt-3 pb-2">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dialogue text or speaker..."
            className="w-full rounded-xl border border-subtle bg-canvas pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex rounded-xl bg-canvas p-1 border border-subtle text-xs shrink-0">
          <button
            type="button"
            onClick={() => setFilterSpeaker('all')}
            className={`rounded-lg px-2.5 py-0.5 font-bold transition-colors cursor-pointer ${
              filterSpeaker === 'all'
                ? 'bg-accent text-accent-fg'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            All ({transcript.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterSpeaker('rep')}
            className={`rounded-lg px-2.5 py-0.5 font-bold transition-colors cursor-pointer ${
              filterSpeaker === 'rep'
                ? 'bg-anchor text-ink-anchor'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Rep
          </button>
          <button
            type="button"
            onClick={() => setFilterSpeaker('customer')}
            className={`rounded-lg px-2.5 py-0.5 font-bold transition-colors cursor-pointer ${
              filterSpeaker === 'customer'
                ? 'bg-status-green text-white'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Customer
          </button>
        </div>
      </div>

      {/* Scrollable Transcript List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto mt-2 pr-1 space-y-3"
      >
        {filteredSegments.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            No dialogue matching your search filters.
          </div>
        ) : (
          filteredSegments.map((seg, index) => {
            const isRep = seg.isRep;
            const isActive = activeSegmentId === seg.id;
            const isEditingThis = editingId === seg.id;

            return (
              <div
                key={seg.id || index}
                className={`group rounded-xl p-3.5 transition-all border ${
                  isActive
                    ? 'border-accent bg-accent-soft shadow-xs'
                    : seg.isFlaggedEvidence
                    ? 'border-accent/45 bg-accent-soft/50'
                    : 'border-subtle bg-canvas/70 hover:border-accent/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-muted font-semibold">
                      #{index + 1}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 font-bold text-[11px] rounded-md px-2 py-0.5 border ${
                        isRep
                          ? 'bg-anchor text-ink-anchor border-transparent'
                          : 'bg-status-green-soft text-status-green border-status-green/30'
                      }`}
                    >
                      <User className="h-3 w-3" />
                      {seg.speaker}
                    </span>

                    {(() => {
                      const isToneEvidence = evidenceQuotes?.some(
                        (eq) =>
                          (eq.timestamp && eq.timestamp === seg.timestamp) ||
                          (eq.quote && seg.text.toLowerCase().includes(eq.quote.toLowerCase().slice(0, 20)))
                      );
                      const isActionItem = actionItems?.some(
                        (act) =>
                          (act.timestamp && act.timestamp === seg.timestamp) ||
                          (act.evidenceQuote && seg.text.toLowerCase().includes(act.evidenceQuote.toLowerCase().slice(0, 20)))
                      );

                      if (isToneEvidence && isActionItem) {
                        return (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded text-[10px] font-bold px-1.5 py-0.5 border ${
                                toneRating === 'RED'
                                  ? 'bg-status-red-soft text-status-red border-status-red/30'
                                  : 'bg-status-green-soft text-status-green border-status-green/30'
                              }`}
                            >
                              <Sparkles className="h-3 w-3" /> Tone Evidence
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-accent-soft text-accent text-[10px] font-bold px-1.5 py-0.5 border border-accent/30">
                              Action Commitment
                            </span>
                          </div>
                        );
                      }

                      if (isToneEvidence) {
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded text-[10px] font-bold px-1.5 py-0.5 border ${
                              toneRating === 'RED'
                                ? 'bg-status-red-soft text-status-red border-status-red/30'
                                : 'bg-status-green-soft text-status-green border-status-green/30'
                            }`}
                          >
                            <Sparkles className="h-3 w-3" /> Tone Evidence Quote
                          </span>
                        );
                      }

                      if (isActionItem) {
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-accent-soft text-accent text-[10px] font-bold px-1.5 py-0.5 border border-accent/30">
                            Action Commitment
                          </span>
                        );
                      }

                      if (seg.isFlaggedEvidence) {
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-accent-soft text-accent text-[10px] font-bold px-1.5 py-0.5 border border-accent/30">
                            <Sparkles className="h-3 w-3" /> Key Moment
                          </span>
                        );
                      }

                      return null;
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isEditingThis && (
                      <button
                        type="button"
                        onClick={() => startEditing(seg)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:text-accent hover:bg-surface transition-all cursor-pointer"
                        title="Fix or edit misheard terms"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSeekAudio && onSeekAudio(seg.seconds)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] text-ink-muted hover:text-accent hover:bg-surface transition-colors cursor-pointer"
                      title="Jump audio to this exact moment"
                    >
                      <Volume2 className="h-3 w-3" />
                      {seg.timestamp}
                    </button>
                  </div>
                </div>

                {isEditingThis ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-muted font-semibold">Speaker:</span>
                      <select
                        value={editSpeaker}
                        onChange={(e) => setEditSpeaker(e.target.value)}
                        className="rounded-lg border border-subtle bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                      >
                        <option value="Sales Rep">Sales Rep</option>
                        <option value="Customer">Customer</option>
                      </select>
                    </div>

                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-subtle bg-surface p-2 text-xs text-ink focus:border-accent focus:outline-none"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-ink-muted hover:bg-surface transition-colors cursor-pointer"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(seg.id)}
                        className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-xs font-bold text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
                      >
                        <Check className="h-3 w-3" /> Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-ink pl-1">{seg.text}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
