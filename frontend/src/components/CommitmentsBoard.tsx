import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Filter,
  Download,
  Sparkles,
  RefreshCw,
  Search,
} from 'lucide-react';
import { ActionItem } from '../types';
import { API_BASE_URL } from '../config';

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
      currentStatus === 'COMPLETED' ? 'PENDING' : currentStatus === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED';

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
    } catch (err) {
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

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `call_commitments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = commitments.filter((c) =>
    searchTerm ? c.task.toLowerCase().includes(searchTerm.toLowerCase()) || c.evidenceQuote.toLowerCase().includes(searchTerm.toLowerCase()) : true
  );

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <CheckSquare className="h-5 w-5 text-amber-400" />
            Commitment &amp; Follow-up Lifecycle Manager
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Grounded action items extracted from audited calls. Track, update status, and sync directly to CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Tabs */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/60 p-0.5 text-xs">
            {(['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1 font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-slate-800 text-amber-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s === 'ALL' ? 'All' : s === 'IN_PROGRESS' ? 'In Progress' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Export to CSV Button */}
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-amber-400 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Commitments Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="h-7 w-7 animate-spin text-amber-400 mb-3" />
          <p className="text-sm font-medium">Loading action items from database...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
          <CheckSquare className="h-10 w-10 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-300">No Commitments in this Category</h3>
          <p className="text-xs text-slate-500 mt-1">
            Change the status filter or audit calls with agreed next steps to populate tasks.
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const isCompleted = item.status === 'COMPLETED';
            const isInProgress = item.status === 'IN_PROGRESS';

            return (
              <div
                key={item.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4.5 transition-all ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-950/10 opacity-75'
                    : isInProgress
                    ? 'border-blue-500/30 bg-blue-950/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Status & Owner Tags */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <button
                      type="button"
                      onClick={() => toggleStatus(item.id, item.status)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border cursor-pointer transition-all ${
                        isCompleted
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : isInProgress
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
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

                    <span className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 font-medium border border-slate-700/60">
                      <User className="h-3 w-3 text-slate-400" />
                      {item.owner}
                    </span>
                  </div>

                  {/* Task Name */}
                  <h4 className={`text-sm font-bold text-slate-100 ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                    {item.task}
                  </h4>

                  {/* Spoken Quote */}
                  <p className="text-xs text-slate-400 italic bg-slate-950/50 rounded-lg p-2.5 mt-2.5 border border-slate-800/80">
                    &ldquo;{item.evidenceQuote}&rdquo;
                  </p>
                </div>

                {/* Footer: Deadline & Time */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-amber-400/90 font-medium">
                    <Calendar className="h-3.5 w-3.5" />
                    {item.deadline || 'No strict deadline'}
                  </span>
                  {item.timestamp && (
                    <span className="font-mono text-slate-500">Call Time: {item.timestamp}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && nextCursor && (
          <div className="pt-2 text-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => fetchCommitments(nextCursor)}
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-5 py-2 text-xs font-bold text-amber-300 hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading more commitments...' : 'Load More Commitments'}
            </button>
          </div>
        )}
      </>
      )}
    </div>
  );
};
