import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { ActionItem } from '@/types';
import { API_BASE_URL } from '@/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EqualizerLoader } from '@/components/reactbits/EqualizerLoader';

export const CommitmentsBoard: React.FC = () => {
  const [commitments, setCommitments] = useState<ActionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<'ALL' | 'Rep' | 'Customer'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCommitments = async (cursorToLoad: string | null = null) => {
    if (cursorToLoad) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      let url = `${API_BASE_URL}/api/commitments`;
      const params = new URLSearchParams();
      params.append('limit', '24');
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (ownerFilter !== 'ALL') params.append('owner', ownerFilter);
      if (cursorToLoad) params.append('cursor', cursorToLoad);
      url += `?${params.toString()}`;

      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const items: ActionItem[] = Array.isArray(data) ? data : data.items || [];
        setCommitments((prev) => (cursorToLoad ? [...prev, ...items] : items));
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (err) {
      console.error('Failed to fetch commitments:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCommitments(null);
  }, [statusFilter, ownerFilter]);

  const toggleStatus = async (id: string, currentStatus?: string) => {
    const nextStatus =
      currentStatus === 'COMPLETED'
        ? 'PENDING'
        : currentStatus === 'PENDING'
        ? 'IN_PROGRESS'
        : 'COMPLETED';

    try {
      const res = await fetch(`${API_BASE_URL}/api/commitments/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setCommitments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: nextStatus as any } : c))
        );
      }
    } catch {
      alert('Failed to update status');
    }
  };

  const exportCSV = () => {
    if (commitments.length === 0) return;
    const headers = ['ID', 'Task', 'Owner', 'Deadline', 'Status', 'Timestamp', 'Evidence Quote'];
    const rows = commitments.map((c) => [
      c.id,
      `"${c.task.replace(/"/g, '""')}"`,
      c.owner,
      c.deadline || 'None',
      c.status || 'PENDING',
      c.timestamp || '',
      `"${c.evidenceQuote.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `call_commitments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = commitments.filter((c) =>
    searchTerm
      ? c.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.evidenceQuote.toLowerCase().includes(searchTerm.toLowerCase())
      : true
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Controls Bar */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display flex items-center gap-2 text-xl font-extrabold text-ink">
            <CheckSquare className="h-5 w-5 text-accent" />
            Commitment &amp; Follow-up Lifecycle Manager
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Grounded action items extracted from audited calls. Track, update status, and export to CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-subtle bg-canvas p-1 text-xs">
            {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 font-bold transition-all cursor-pointer ${
                  statusFilter === s
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s === 'ALL'
                  ? 'All'
                  : s === 'IN_PROGRESS'
                  ? 'In Progress'
                  : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
          <EqualizerLoader size="md" />
          <p className="text-sm font-medium">Loading action items from database...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-ink-muted">
          <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <h3 className="text-base font-bold text-ink">No Commitments in this Category</h3>
          <p className="text-xs text-ink-muted mt-1">
            Change the status filter or audit calls with agreed next steps to populate tasks.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => {
              const isCompleted = item.status === 'COMPLETED';
              const isInProgress = item.status === 'IN_PROGRESS';

              return (
                <Card
                  key={item.id}
                  className={`flex flex-col justify-between p-5 transition-all ${
                    isCompleted ? 'border-status-green/35 opacity-80' : 'hover:border-accent/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => toggleStatus(item.id, item.status)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border cursor-pointer transition-all ${
                          isCompleted
                            ? 'border-status-green/40 bg-status-green-soft text-status-green'
                            : isInProgress
                            ? 'border-strong bg-anchor text-ink-anchor'
                            : 'border-accent/40 bg-accent-soft text-accent'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Resolved</span>
                          </>
                        ) : isInProgress ? (
                          <>
                            <Clock className="h-3 w-3" />
                            <span>In Progress</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            <span>Pending</span>
                          </>
                        )}
                      </button>

                      <Badge variant="default" className="rounded-md">
                        <User className="h-3 w-3" />
                        {item.owner}
                      </Badge>
                    </div>

                    <h4
                      className={`text-sm font-bold text-ink ${
                        isCompleted ? 'line-through text-ink-muted' : ''
                      }`}
                    >
                      {item.task}
                    </h4>

                    <p className="text-xs text-ink-muted italic bg-canvas rounded-xl p-3 mt-3 border border-subtle">
                      &ldquo;{item.evidenceQuote}&rdquo;
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-[11px] text-ink-muted">
                    <span className="flex items-center gap-1 text-accent font-bold">
                      <Calendar className="h-3.5 w-3.5" />
                      {item.deadline || 'No strict deadline'}
                    </span>
                    {item.timestamp && (
                      <span className="font-mono text-ink-muted">Call Time: {item.timestamp}</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          {hasMore && nextCursor && (
            <div className="pt-2 text-center">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingMore}
                onClick={() => fetchCommitments(nextCursor)}
              >
                {isLoadingMore ? 'Loading more commitments...' : 'Load More Commitments'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
