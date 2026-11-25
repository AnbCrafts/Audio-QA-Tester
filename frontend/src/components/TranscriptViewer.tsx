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
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-lg flex flex-col transition-all ${
        isExpanded ? 'min-h-[850px]' : 'h-[650px]'
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-amber-400" />
              Full Call Transcript ({transcript.length} Turns)
            </h3>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-slate-700">
              Complete Conversation
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Scroll up/down to browse all turns from 00:00 to end. Click pencil to edit misheard terms.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Scroll Nav Buttons */}
          <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5">
            <button
              onClick={scrollToTop}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-900 rounded transition-colors cursor-pointer"
              title="Scroll to Top (00:00)"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={scrollToBottom}
              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-900 rounded transition-colors cursor-pointer"
              title="Scroll to Bottom"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse height' : 'Expand full height'}
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
            onClick={handleCopyTranscript}
            className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title="Copy entire transcript to clipboard"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownloadTranscript}
            className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            title="Download full transcript as .txt file"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Search & Speaker Filter Bar */}
      <div className="flex items-center justify-between gap-3 pt-3 pb-2">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dialogue text or speaker..."
            className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs shrink-0">
          <button
            onClick={() => setFilterSpeaker('all')}
            className={`rounded px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
              filterSpeaker === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({transcript.length})
          </button>
          <button
            onClick={() => setFilterSpeaker('rep')}
            className={`rounded px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
              filterSpeaker === 'rep'
                ? 'bg-indigo-500 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Rep
          </button>
          <button
            onClick={() => setFilterSpeaker('customer')}
            className={`rounded px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
              filterSpeaker === 'customer'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Customer
          </button>
        </div>
      </div>

      {/* Scrollable Transcript List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto mt-2 pr-2 space-y-3"
      >
        {filteredSegments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
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
                    ? 'border-amber-400 bg-amber-500/10 shadow-md'
                    : seg.isFlaggedEvidence
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-slate-800/80 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                {/* Segment Meta */}
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Sequence Badge */}
                    <span className="font-mono text-[10px] text-slate-500 font-semibold">
                      #{index + 1}
                    </span>

                    {/* Speaker Badge */}
                    <span
                      className={`inline-flex items-center gap-1 font-bold text-[11px] rounded px-2 py-0.5 ${
                        isRep
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      <User className="h-3 w-3" />
                      {seg.speaker}
                    </span>

                    {/* Key moment marker: Distinguish Tone Evidence vs Action Commitment */}
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
                            <span className={`inline-flex items-center gap-1 rounded text-[10px] font-bold px-1.5 py-0.5 border ${
                              toneRating === 'RED'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}>
                              <Sparkles className="h-3 w-3" /> Tone Evidence
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 border border-amber-500/30">
                              📋 Action Commitment
                            </span>
                          </div>
                        );
                      }

                      if (isToneEvidence) {
                        return (
                          <span className={`inline-flex items-center gap-1 rounded text-[10px] font-bold px-1.5 py-0.5 border ${
                            toneRating === 'RED'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}>
                            <Sparkles className="h-3 w-3" /> Tone Evidence Quote
                          </span>
                        );
                      }

                      if (isActionItem) {
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 border border-amber-500/30">
                            📋 Action Commitment
                          </span>
                        );
                      }

                      if (seg.isFlaggedEvidence) {
                        return (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 border border-amber-500/30">
                            <Sparkles className="h-3 w-3" /> Key Moment
                          </span>
                        );
                      }

                      return null;
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Inline Edit Trigger */}
                    {!isEditingThis && (
                      <button
                        onClick={() => startEditing(seg)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all cursor-pointer"
                        title="Fix or edit misheard terms"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                    )}

                    {/* Timestamp & Playback Seek */}
                    <button
                      onClick={() => onSeekAudio && onSeekAudio(seg.seconds)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Jump audio to this exact moment"
                    >
                      <Volume2 className="h-3 w-3" />
                      {seg.timestamp}
                    </button>
                  </div>
                </div>

                {/* Dialogue Content or Edit Form */}
                {isEditingThis ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Speaker:</span>
                      <select
                        value={editSpeaker}
                        onChange={(e) => setEditSpeaker(e.target.value)}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="Sales Rep">Sales Rep</option>
                        <option value="Customer">Customer</option>
                      </select>
                    </div>

                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(seg.id)}
                        className="flex items-center gap-1 rounded bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        <Check className="h-3 w-3" /> Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-200 pl-1">
                    {seg.text}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
