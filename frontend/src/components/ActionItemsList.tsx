import React from 'react';
import { CheckSquare, Calendar, User, Quote, Clock, Play } from 'lucide-react';
import { ActionItem } from '../types';

interface ActionItemsListProps {
  actionItems: ActionItem[];
  onSeekTimestamp?: (timestamp: string, seconds?: number | null) => void;
}

export const ActionItemsList: React.FC<ActionItemsListProps> = ({
  actionItems,
  onSeekTimestamp,
}) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-amber-400" />
            Extracted Commitments & Action Items
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Strictly grounded in transcript commitments with exact call timestamps.
          </p>
        </div>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-700">
          {actionItems.length} Commitments
        </span>
      </div>

      {actionItems.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          No explicit commitments or follow-up deadlines detected in this recording.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {actionItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-white leading-snug">
                  {item.task}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Timestamp seek button */}
                  {item.timestamp && (
                    <button
                      type="button"
                      onClick={() =>
                        onSeekTimestamp && onSeekTimestamp(item.timestamp!, item.seconds)
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
                      title="Jump to audio when this commitment was dictated"
                    >
                      <Play className="h-2.5 w-2.5" />
                      ⏱ {item.timestamp}
                    </button>
                  )}

                  {/* Owner Badge */}
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                      item.owner === 'Sales Rep'
                        ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
                        : item.owner === 'Customer'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    }`}
                  >
                    <User className="h-3 w-3" />
                    {item.owner}
                  </span>

                  {/* Deadline Badge */}
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                      item.deadline
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : 'border-slate-800 bg-slate-900 text-slate-500 italic'
                    }`}
                  >
                    <Calendar className="h-3 w-3" />
                    {item.deadline ? item.deadline : 'No Deadline'}
                  </span>
                </div>
              </div>

              {/* Supporting Evidence Quote */}
              <div
                onClick={() =>
                  item.timestamp && onSeekTimestamp && onSeekTimestamp(item.timestamp, item.seconds)
                }
                className="mt-2 rounded-lg bg-slate-900/90 border border-slate-800/80 px-3 py-2 text-xs cursor-pointer hover:border-slate-700 transition-colors"
                title="Click to jump audio to this quote"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">
                  <Quote className="h-3 w-3 text-amber-400" />
                  Spoken in Call:
                </div>
                <p className="text-slate-300 italic">
                  "{item.evidenceQuote}"
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
