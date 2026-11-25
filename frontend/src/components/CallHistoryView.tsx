import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Play,
  Trash2,
  Clock,
  ArrowRight,
  RefreshCw,
  FileAudio,
  Sparkles,
} from 'lucide-react';
import { CallHistoryItem } from '../types';

interface CallHistoryViewProps {
  onSelectCall: (callId: string) => void;
}

export const CallHistoryView: React.FC<CallHistoryViewProps> = ({ onSelectCall }) => {
  const [history, setHistory] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toneFilter, setToneFilter] = useState<'ALL' | 'GREEN' | 'RED'>('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let url = 'http://localhost:8000/api/history?limit=100';
      if (toneFilter !== 'ALL') url += `&tone=${toneFilter}`;
      if (searchTerm.trim()) url += `&search=${encodeURIComponent(searchTerm.trim())}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch call history');
      const data = await res.json();
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Could not load history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [toneFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this historical audit from database?')) return;
    try {
      await fetch(`http://localhost:8000/api/history/${id}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert('Failed to delete call record.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <History className="h-5 w-5 text-amber-400" />
            Historical Call Explorer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Database-persisted audits. Click any call to reload its waveform audio player, synced transcript, and scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search filename or topic..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/80 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </form>

          {/* Tone Filter Buttons */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/60 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setToneFilter('ALL')}
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                toneFilter === 'ALL' ? 'bg-slate-800 text-amber-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setToneFilter('GREEN')}
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                toneFilter === 'GREEN' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              Compliant
            </button>
            <button
              type="button"
              onClick={() => setToneFilter('RED')}
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                toneFilter === 'RED' ? 'bg-rose-500/20 text-rose-400 shadow-sm' : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              Red Flags
            </button>
          </div>

          <button
            type="button"
            onClick={fetchHistory}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-amber-400 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-amber-400 mb-3" />
            <p className="text-sm font-medium">Fetching audits from database...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-sm">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-rose-400" />
            {error}
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileAudio className="h-10 w-10 mx-auto mb-3 text-slate-600" />
            <h3 className="text-base font-semibold text-slate-300">No Audited Calls Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Upload an audio recording in the Live Auditor tab to generate and permanently store your first call audit.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Audio Recording</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Demeanor Score</th>
                  <th className="py-3 px-4">Commitments</th>
                  <th className="py-3 px-4">Turns</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {history.map((call) => {
                  const isRed = call.toneRating === 'RED';
                  return (
                    <tr
                      key={call.id}
                      onClick={() => onSelectCall(call.id)}
                      className="group cursor-pointer hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {call.createdAt}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-100 flex items-center gap-2">
                        <FileAudio className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        <span className="truncate max-w-[200px]" title={call.filename}>
                          {call.filename}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">({call.duration})</span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700/60">
                          {call.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                            isRed
                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {isRed ? (
                            <AlertTriangle className="h-3 w-3 text-rose-400" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          )}
                          {call.overallScore.toFixed(1)} / 5.0
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="rounded-md bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[11px] font-bold border border-amber-500/20">
                          {call.commitmentsCount} Tasks
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {call.turnsCount} turns
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCall(call.id);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400 hover:bg-amber-400 hover:text-slate-950 transition-all border border-amber-500/30"
                          >
                            <span>Open Audit</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(call.id, e)}
                            className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
