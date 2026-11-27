import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ArrowRight,
  RefreshCw,
  FileAudio,
} from 'lucide-react';
import { CallHistoryItem } from '@/types';
import { API_BASE_URL } from '@/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EqualizerLoader } from '@/components/reactbits/EqualizerLoader';

interface CallHistoryViewProps {
  onSelectCall: (callId: string, seekSeconds?: number | null) => void;
}

export const CallHistoryView: React.FC<CallHistoryViewProps> = ({ onSelectCall }) => {
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toneFilter, setToneFilter] = useState<'ALL' | 'GREEN' | 'RED'>('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (cursorToLoad: string | null = null) => {
    if (cursorToLoad) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      let url = `${API_BASE_URL}/api/history?limit=25`;
      if (toneFilter !== 'ALL') url += `&tone=${toneFilter}`;
      if (searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm.trim())}`;
      if (cursorToLoad) url += `&cursor=${encodeURIComponent(cursorToLoad)}`;

      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch call history');
      const data = await res.json();
      const items: CallHistoryItem[] = Array.isArray(data) ? data : data.items || [];
      setHistory((prev) => (cursorToLoad ? [...prev, ...items] : items));
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err: any) {
      setError(err.message || 'Could not load history');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistory(null);
  }, [toneFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this historical audit from database?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Delete failed');
      }
      setHistory((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete call record.');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Filters */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display flex items-center gap-2 text-xl font-extrabold text-ink">
            <History className="h-5 w-5 text-accent" />
            Historical Call Explorer
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Database-persisted audits &amp; full-text spoken transcript search. Click any match to jump directly to that moment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
            <Input
              type="text"
              placeholder="Search filenames, topics, or spoken transcript..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </form>

          <div className="flex items-center rounded-xl border border-subtle bg-canvas p-1 text-xs">
            <button
              type="button"
              onClick={() => setToneFilter('ALL')}
              className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                toneFilter === 'ALL'
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setToneFilter('GREEN')}
              className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                toneFilter === 'GREEN'
                  ? 'bg-status-green text-white shadow-xs'
                  : 'text-ink-muted hover:text-status-green'
              }`}
            >
              Compliant
            </button>
            <button
              type="button"
              onClick={() => setToneFilter('RED')}
              className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                toneFilter === 'RED'
                  ? 'bg-status-red text-white shadow-xs'
                  : 'text-ink-muted hover:text-status-red'
              }`}
            >
              Red Flags
            </button>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => fetchHistory(null)}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Table Content */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
            <EqualizerLoader size="md" />
            <p className="text-sm font-medium">Fetching audits from database...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-status-red text-sm">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
            {error}
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-ink-muted">
            <FileAudio className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-bold text-ink">No Audited Calls Found</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
              Upload an audio recording in the Live Auditor tab to generate and permanently store your first call audit.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Audio Recording</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Demeanor Score</TableHead>
                  <TableHead>Commitments</TableHead>
                  <TableHead>Turns</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((call) => {
                  const isRed = call.toneRating === 'RED';
                  return (
                    <TableRow
                      key={call.id}
                      onClick={() => onSelectCall(call.id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap text-ink-muted font-mono text-[11px]">
                        {call.createdAt}
                      </TableCell>
                      <TableCell className="font-semibold text-ink">
                        <div className="flex items-center gap-2">
                          <FileAudio className="h-4 w-4 text-accent flex-shrink-0" />
                          <span className="truncate max-w-[200px]" title={call.filename}>
                            {call.filename}
                          </span>
                          <span className="text-[10px] text-ink-muted font-mono">
                            ({call.duration})
                          </span>
                        </div>
                        {call.matchedSnippet && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCall(call.id, call.matchedSeconds ?? 0);
                            }}
                            className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-accent-soft border border-accent/30 px-2 py-0.5 text-[11px] text-ink hover:border-accent text-left cursor-pointer"
                          >
                            <span className="font-mono text-accent font-bold shrink-0">
                              [{call.matchedTimestamp || '00:00'}]
                            </span>
                            <span className="truncate max-w-[260px]">"{call.matchedSnippet}"</span>
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="default" className="rounded-md">
                          {call.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={isRed ? 'red' : 'green'}>
                          {isRed ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {call.overallScore.toFixed(1)} / 5.0
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="accent" className="rounded-md">
                          {call.commitmentsCount} Tasks
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-ink-muted font-mono text-[11px]">
                        {call.turnsCount} turns
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCall(call.id);
                            }}
                          >
                            <span>Open Audit</span>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(call.id, e)}
                            className="rounded-lg p-1.5 text-ink-muted hover:text-status-red hover:bg-status-red-soft transition-colors cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {hasMore && nextCursor && (
              <div className="border-t border-subtle p-4 text-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoadingMore}
                  onClick={() => fetchHistory(nextCursor)}
                >
                  {isLoadingMore ? 'Loading more calls...' : 'Load More Calls'}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
