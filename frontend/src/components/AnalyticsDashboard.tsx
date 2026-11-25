import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { AnalyticsOverview } from '../types';

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/analytics/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <BarChart3 className="h-5 w-5 text-amber-400" />
            Executive QA &amp; Team Demeanor Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Aggregated metrics calculated across all database-audited customer conversations.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchAnalytics}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-amber-400 transition-all self-start md:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Metrics
        </button>
      </div>

      {isLoading || !data ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="h-7 w-7 animate-spin text-amber-400 mb-3" />
          <p className="text-sm font-medium">Computing team analytics...</p>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Average Quality Score */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Avg Quality Score</span>
                <Sparkles className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-100">
                  {data.averageScore.toFixed(1)}
                </span>
                <span className="text-xs text-slate-500 font-bold">/ 5.0</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Weighted across Demeanor (40%), Policy (30%), and Commitments (30%)
              </p>
            </div>

            {/* KPI 2: Total Calls Audited */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Calls Audited</span>
                <PhoneCall className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-100">{data.totalCalls}</span>
                <span className="text-xs text-slate-500 font-medium">recordings</span>
              </div>
              <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {data.greenFlagCount} compliant ({data.totalCalls > 0 ? ((data.greenFlagCount / data.totalCalls) * 100).toFixed(0) : 0}%)
              </p>
            </div>

            {/* KPI 3: Escalation / Red Flag Rate */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Red Flag Rate</span>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-400">{data.escalationRate}%</span>
                <span className="text-xs text-slate-500 font-medium">({data.redFlagCount} calls)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Calls flagged with hostility, dismissiveness, or protocol breach
              </p>
            </div>

            {/* KPI 4: Commitment Resolution Rate */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Commitment Resolution</span>
                <CheckSquare className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-400">{data.completionRate}%</span>
                <span className="text-xs text-slate-500 font-medium">resolved</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {data.completedCommitments} completed of {data.totalCommitments} total promises
              </p>
            </div>
          </div>

          {/* Detailed Analytical Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: ScaleWorks 40-30-30 Evaluation Standard */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm">
              <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-400" />
                ScaleWorks 40-30-30 Rubric Weighting
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-300">1. Demeanor &amp; Respect (40% Weight)</span>
                    <span className="text-amber-400 font-bold">Primary Penalty Trigger</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: '40%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Isolates agent patience, professional phrasing, and active listening. Automatically flags insults as RED.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-300">2. Policy &amp; Compliance (30% Weight)</span>
                    <span className="text-blue-400 font-bold">Standard Adherence</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '30%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Checks greetings, professional closings, and adherence to preset industry rules.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-300">3. Commitment Resolution (30% Weight)</span>
                    <span className="text-emerald-400 font-bold">Action Grounding</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '30%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Extracts concrete next steps with timestamps, rejecting speculative hedge words.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Coaching Recommendations & Next Steps */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Automated Team Coaching Insights
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-slate-300">
                    <strong className="text-rose-400 block mb-0.5">⚠️ Demeanor Alert in B2B SaaS Triage</strong>
                    Turn #5 in Call Sample 1 was cited for dismissive language (<em>"if your engineering team cannot understand..."</em>). Recommend refresher on handling technically demanding prospects.
                  </div>

                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-slate-300">
                    <strong className="text-emerald-400 block mb-0.5">✅ High Commitment Capture Reliability</strong>
                    100% of extracted action items contain verified timestamp offsets, enabling 1-click playback verification.
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
                Data synchronized with SQLite / PostgreSQL backend &bull; Zero external polling required
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
