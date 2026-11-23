import React, { useState } from 'react';
import { MessagesSquare, Search, User, Filter, Sparkles, Volume2 } from 'lucide-react';
import { TranscriptSegment } from '../types';

interface TranscriptViewerProps {
  transcript: TranscriptSegment[];
  onSeekAudio?: (seconds: number) => void;
  activeSegmentId?: string | null;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  onSeekAudio,
  activeSegmentId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSpeaker, setFilterSpeaker] = useState<'all' | 'rep' | 'customer'>('all');

  const filteredSegments = transcript.filter((seg) => {
    const matchesSearch = seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterSpeaker === 'rep') return seg.isRep;
    if (filterSpeaker === 'customer') return !seg.isRep;
    return true;
  });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-lg flex flex-col h-[600px]">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-amber-400" />
            Call Transcript & Speaker Diarization
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Automated speaker separation distinguishing Representative from Customer
          </p>
        </div>

        {/* Search & Speaker Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript..."
              className="rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none w-44"
            />
          </div>

          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setFilterSpeaker('all')}
              className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                filterSpeaker === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterSpeaker('rep')}
              className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                filterSpeaker === 'rep' ? 'bg-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Rep
            </button>
            <button
              onClick={() => setFilterSpeaker('customer')}
              className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                filterSpeaker === 'customer' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Customer
            </button>
          </div>
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div className="flex-1 overflow-y-auto mt-4 pr-2 space-y-3.5">
        {filteredSegments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No dialogue matching your search filters.
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isRep = seg.isRep;
            const isActive = activeSegmentId === seg.id;

            return (
              <div
                key={seg.id}
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

                    {seg.isFlaggedEvidence && (
                      <span className="flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 border border-amber-500/30">
                        <Sparkles className="h-3 w-3" /> Key Evidence
                      </span>
                    )}
                  </div>

                  {/* Timestamp & Playback Seek */}
                  <button
                    onClick={() => onSeekAudio && onSeekAudio(seg.seconds)}
                    className="flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Jump to audio timestamp"
                  >
                    <Volume2 className="h-3 w-3" />
                    {seg.timestamp}
                  </button>
                </div>

                {/* Dialog Text */}
                <p className="text-xs leading-relaxed text-slate-200 pl-1">
                  {seg.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
