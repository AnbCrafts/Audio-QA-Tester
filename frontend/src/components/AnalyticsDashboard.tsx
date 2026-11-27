import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Sparkles,
  ShieldCheck,
  CheckSquare,
  RefreshCw,
  Coins,
  Cpu,
} from 'lucide-react';
import { AnalyticsOverview, CoachingInsights, OrgTokenQuota } from '@/types';
import { API_BASE_URL } from '@/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CountUp } from '@/components/reactbits/CountUp';
import { EqualizerLoader } from '@/components/reactbits/EqualizerLoader';

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [insights, setInsights] = useState<CoachingInsights | null>(null);
  const [tokenQuota, setTokenQuota] = useState<OrgTokenQuota | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, quotaRes, insightsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/overview`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/org/token-quota`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/analytics/insights`, { credentials: 'include' }),
      ]);
      if (overviewRes.ok) setData(await overviewRes.json());
      if (quotaRes.ok) setTokenQuota(await quotaRes.json());
      if (insightsRes.ok) setInsights(await insightsRes.json());
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
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display flex items-center gap-2 text-xl font-extrabold text-ink">
            <BarChart3 className="h-5 w-5 text-accent" />
            Executive QA &amp; Team Demeanor Analytics
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Aggregated metrics computed in SQL across all database-audited customer conversations.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchAnalytics}
          className="self-start md:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Metrics
        </Button>
      </Card>

      {isLoading || !data ? (
        <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
          <EqualizerLoader size="md" />
          <p className="text-sm font-medium">Computing team analytics...</p>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Avg Quality Score</span>
                <Sparkles className="h-4 w-4 text-accent" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-ink">
                  <CountUp to={data.averageScore} decimals={1} />
                </span>
                <span className="text-xs text-ink-muted font-bold">/ 5.0</span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1.5">
                Weighted across Demeanor (40%), Policy (30%), and Commitments (30%)
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Calls Audited</span>
                <PhoneCall className="h-4 w-4 text-accent" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-ink">
                  <CountUp to={data.totalCalls} />
                </span>
                <span className="text-xs text-ink-muted font-medium">recordings</span>
              </div>
              <p className="text-[11px] text-status-green mt-1.5 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" />
                {data.greenFlagCount} compliant (
                {data.totalCalls > 0
                  ? ((data.greenFlagCount / data.totalCalls) * 100).toFixed(0)
                  : 0}
                %)
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Red Flag Rate</span>
                <AlertTriangle className="h-4 w-4 text-status-red" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-status-red">
                  <CountUp to={data.escalationRate} decimals={1} suffix="%" />
                </span>
                <span className="text-xs text-ink-muted font-medium">
                  ({data.redFlagCount} calls)
                </span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1.5">
                Calls flagged with hostility, dismissiveness, or protocol breach
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Commitment Resolution
                </span>
                <CheckSquare className="h-4 w-4 text-status-green" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-black text-status-green">
                  <CountUp to={data.completionRate} decimals={1} suffix="%" />
                </span>
                <span className="text-xs text-ink-muted font-medium">resolved</span>
              </div>
              <p className="text-[11px] text-ink-muted mt-1.5">
                {data.completedCommitments} completed of {data.totalCommitments} total promises
              </p>
            </Card>
          </div>

          {/* Tenant Daily Token Quota & Next-Day Renewal Card */}
          {tokenQuota && (
            <Card className={`p-5 ${tokenQuota.isExhausted ? 'border-status-red/40' : ''}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
                    <Coins className="h-4 w-4 text-accent" />
                    Tenant Daily AI Token Quota &mdash;{' '}
                    <span className="text-accent">{tokenQuota.orgName}</span>
                  </h3>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Resets automatically every day at 00:00 UTC (Next renewal:{' '}
                    <span className="text-ink font-semibold">
                      {new Date(tokenQuota.renewsAtUtc).toLocaleString()}
                    </span>
                    )
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="text-right">
                    <div className="text-ink-muted text-[10px] uppercase">Today Usage</div>
                    <div className="font-bold text-ink">
                      {tokenQuota.usedToday.toLocaleString()} /{' '}
                      {tokenQuota.dailyLimit.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-ink-muted text-[10px] uppercase">All-Time Spend</div>
                    <div className="font-bold text-status-green">
                      ${tokenQuota.totalCostUsdAllTime.toFixed(4)} (
                      {tokenQuota.totalTokensAllTime.toLocaleString()} tok)
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-subtle overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    tokenQuota.isExhausted
                      ? 'bg-status-red'
                      : tokenQuota.usagePct >= 80
                      ? 'bg-accent'
                      : 'bg-status-green'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, tokenQuota.usagePct))}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span
                  className={
                    tokenQuota.isExhausted
                      ? 'text-status-red font-bold'
                      : 'text-ink-muted font-medium'
                  }
                >
                  {tokenQuota.isExhausted
                    ? `Daily quota exhausted. New analyses pause until renewal at ${new Date(
                        tokenQuota.renewsAtUtc
                      ).toLocaleTimeString()}.`
                    : `${tokenQuota.remainingToday.toLocaleString()} tokens remaining today (${(
                        100 - tokenQuota.usagePct
                      ).toFixed(1)}% left)`}
                </span>

                {tokenQuota.byModel.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {tokenQuota.byModel.map((m) => (
                      <Badge
                        key={`${m.provider}-${m.model}`}
                        variant="default"
                        className="rounded-lg font-mono text-[10px]"
                      >
                        <Cpu className="h-3 w-3 text-accent" />
                        {m.model}: {m.totalTokens.toLocaleString()} (${m.costUsd.toFixed(4)})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Detailed Analytical Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: 40-30-30 Standard */}
            <Card className="p-5">
              <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Inflect 40-30-30 Rubric Weighting
              </h3>
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-ink">1. Tone &amp; Demeanor Isolation (40%)</span>
                    <span className="text-accent font-bold">Primary Penalty Trigger</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: '40%' }} />
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Isolates agent patience, professional phrasing, and active listening. Flags insults automatically.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-ink">2. Policy &amp; Compliance (30%)</span>
                    <span className="text-ink font-bold">Standard Adherence</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
                    <div className="h-full bg-anchor rounded-full" style={{ width: '30%' }} />
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Checks greetings, professional closings, and adherence to preset industry rules.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-ink">3. Commitment Resolution (30%)</span>
                    <span className="text-status-green font-bold">Action Grounding</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-subtle overflow-hidden">
                    <div className="h-full bg-status-green rounded-full" style={{ width: '30%' }} />
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    Extracts concrete next steps with timestamps, rejecting fabricated deadlines.
                  </p>
                </div>
              </div>
            </Card>

            {/* Card 2: Dynamic Coaching Insights */}
            <Card className="p-5 flex flex-col justify-between">
              <div>
                <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-status-green" />
                  Live Workspace Coaching Insights
                </h3>
                {!insights || insights.totalCalls === 0 ? (
                  <div className="rounded-xl bg-canvas border border-subtle p-4 text-xs text-ink-muted">
                    Analyze your first call recording in this workspace to unlock live dimension averages, escalation hotspots, and commitment grounding diagnostics.
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {insights.latestRedQuote ? (
                      <div className="rounded-xl bg-status-red-soft border border-status-red/30 p-3 text-ink">
                        <strong className="text-status-red block mb-0.5">
                          Latest Escalation ({insights.latestRedQuote.filename})
                        </strong>
                        <p className="italic">"{insights.latestRedQuote.quote}"</p>
                        {insights.topEscalationCategory && (
                          <span className="mt-1 inline-block text-[11px] text-status-red font-semibold">
                            Hotspot: {insights.topEscalationCategory} ({insights.topEscalationRate}% RED rate)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-status-green-soft border border-status-green/30 p-3 text-ink">
                        <strong className="text-status-green block mb-0.5">
                          Zero RED Escalations Recorded
                        </strong>
                        All {insights.totalCalls} analyzed calls in this workspace met tone compliance standards.
                      </div>
                    )}

                    {insights.weakestDimension && (
                      <div className="rounded-xl bg-accent-soft border border-accent/30 p-3 text-ink">
                        <strong className="text-accent block mb-1.5">
                          Coaching Focus: {insights.weakestDimension} (Avg {insights.weakestDimensionAvg})
                        </strong>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(insights.dimensionAverages).map(([dim, avg]) => (
                            <span
                              key={dim}
                              className="rounded-md bg-surface border border-subtle px-2 py-0.5 text-[10px] font-mono text-ink"
                            >
                              {dim}: {avg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl bg-status-green-soft border border-status-green/30 p-3 text-ink">
                      <strong className="text-status-green block mb-0.5">
                        Commitment Deadline Grounding: {insights.deadlineGroundingPct}%
                      </strong>
                      Percentage of extracted action items with explicit non-vague deadlines across{' '}
                      {insights.totalCalls} audited calls.
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-subtle text-[11px] text-ink-muted">
                Computed live from tenant SQLite / PostgreSQL call audits &bull; Zero mock data
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
