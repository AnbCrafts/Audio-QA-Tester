import React from 'react';
import { CheckSquare, Calendar, User, Quote, Play } from 'lucide-react';
import { ActionItem } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ActionItemsListProps {
  actionItems: ActionItem[];
  onSeekTimestamp?: (timestamp: string, seconds?: number | null) => void;
}

export const ActionItemsList: React.FC<ActionItemsListProps> = ({
  actionItems,
  onSeekTimestamp,
}) => {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between pb-4 border-b border-subtle">
        <div>
          <h3 className="font-display text-base font-extrabold text-ink flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-accent" />
            Extracted Commitments &amp; Action Items
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Strictly grounded in transcript commitments with exact call timestamps.
          </p>
        </div>
        <Badge variant="default" className="px-2.5 py-1">
          {actionItems.length} Commitments
        </Badge>
      </div>

      {actionItems.length === 0 ? (
        <div className="py-8 text-center text-xs text-ink-muted">
          No explicit commitments or follow-up deadlines detected in this recording.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {actionItems.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-subtle bg-canvas/70 p-4 transition-all hover:border-accent/50"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <span className="text-sm font-bold text-ink leading-snug">
                  {item.task}
                </span>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.timestamp && (
                    <button
                      type="button"
                      onClick={() =>
                        onSeekTimestamp && onSeekTimestamp(item.timestamp!, item.seconds)
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-0.5 text-[11px] font-mono font-bold text-accent border border-accent/35 hover:opacity-85 transition-opacity cursor-pointer"
                      title="Jump to audio when this commitment was dictated"
                    >
                      <Play className="h-2.5 w-2.5" />
                      {item.timestamp}
                    </button>
                  )}

                  <Badge
                    variant={item.owner === 'Customer' ? 'green' : item.owner === 'Sales Rep' ? 'accent' : 'default'}
                    className="rounded-md"
                  >
                    <User className="h-3 w-3" />
                    {item.owner}
                  </Badge>

                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                      item.deadline
                        ? 'border-accent/35 bg-accent-soft text-accent'
                        : 'border-subtle bg-surface text-ink-muted italic'
                    }`}
                  >
                    <Calendar className="h-3 w-3" />
                    {item.deadline ? item.deadline : 'No Deadline'}
                  </span>
                </div>
              </div>

              <div
                onClick={() =>
                  item.timestamp && onSeekTimestamp && onSeekTimestamp(item.timestamp, item.seconds)
                }
                className="mt-2 rounded-lg bg-surface border border-subtle px-3 py-2 text-xs cursor-pointer hover:border-accent/50 transition-colors"
                title="Click to jump audio to this quote"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-ink-muted tracking-wider mb-1">
                  <Quote className="h-3 w-3 text-accent" />
                  Spoken in Call:
                </div>
                <p className="text-ink italic">"{item.evidenceQuote}"</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
