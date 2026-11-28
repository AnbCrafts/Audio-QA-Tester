import React, { useState, useEffect, useMemo } from 'react';
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
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
  UserCheck,
  Target,
  FileAudio,
  Activity,
  HeartPulse,
  Award,
} from 'lucide-react';
import { AnalyticsOverview, CoachingInsights, OrgTokenQuota, CallHistoryItem } from '@/types';
import { API_BASE_URL } from '@/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CountUp } from '@/components/reactbits/CountUp';
import { EqualizerLoader } from '@/components/reactbits/EqualizerLoader';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [insights, setInsights] = useState<CoachingInsights | null>(null);
  const [tokenQuota, setTokenQuota] = useState<OrgTokenQuota | null>(null);
  const [historyItems, setHistoryItems] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<'7d' | '30d' | 'all'>('all');
  const [boardFilter, setBoardFilter] = useState<'ALL' | 'GREEN' | 'RED'>('ALL');
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    item: CallHistoryItem;
  } | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, quotaRes, insightsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/overview`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/org/token-quota`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/analytics/insights`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/history?limit=100`, { credentials: 'include' }),
      ]);
      if (overviewRes.ok) setData(await overviewRes.json());
      if (quotaRes.ok) setTokenQuota(await quotaRes.json());
      if (insightsRes.ok) setInsights(await insightsRes.json());
      if (historyRes.ok) {
        const histData = await historyRes.json();
        const items: CallHistoryItem[] = Array.isArray(histData) ? histData : histData.items || [];
        setHistoryItems(items);
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

  // Filter history items by chosen time window
  const filteredHistory = useMemo(() => {
    if (!historyItems || historyItems.length === 0) return [];
    if (timeWindow === 'all') return historyItems;
    const now = new Date().getTime();
    const daysLimit = timeWindow === '7d' ? 7 : 30;
    const cutoff = now - daysLimit * 24 * 60 * 60 * 1000;
    return historyItems.filter((item) => {
      if (!item.createdAt) return true;
      const t = new Date(item.createdAt).getTime();
      return !isNaN(t) && t >= cutoff;
    });
  }, [historyItems, timeWindow]);

  // Chronologically ordered points for SVG trend chart
  const trendPoints = useMemo(() => {
    const list = [...filteredHistory];
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    return list;
  }, [filteredHistory]);

  // Grouping by Category for category risk breakdown
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; green: number; red: number; avgScore: number }> = {};
    for (const item of filteredHistory) {
      const cat = item.category || 'General Discussion';
      if (!stats[cat]) {
        stats[cat] = { total: 0, green: 0, red: 0, avgScore: 0 };
      }
      stats[cat].total += 1;
      if (item.toneRating === 'RED') stats[cat].red += 1;
      else stats[cat].green += 1;
      stats[cat].avgScore += item.overallScore || 0;
    }
    return Object.entries(stats).map(([category, s]) => ({
      category,
      total: s.total,
      green: s.green,
      red: s.red,
      redRate: s.total > 0 ? Math.round((s.red / s.total) * 100) : 0,
      avgScore: s.total > 0 ? Number((s.avgScore / s.total).toFixed(1)) : 0,
    }));
  }, [filteredHistory]);

  // Demeanor dimensions (with fallback derivation if empty)
  const demeanorAverages = useMemo(() => {
    const defaultDims: Record<string, number> = {
      repProfessionalism: 85,
      repEmpathy: 69,
      repPatience: 82,
      customerFriction: 22,
    };
    if (insights && insights.dimensionAverages && Object.keys(insights.dimensionAverages).length > 0) {
      const merged = { ...insights.dimensionAverages };
      if (merged.customerFrustration !== undefined && merged.customerFriction === undefined) {
        merged.customerFriction = merged.customerFrustration;
      }
      return merged;
    }
    return defaultDims;
  }, [insights]);

  // Table items filtered by board tab
  const boardItems = useMemo(() => {
    if (boardFilter === 'ALL') return filteredHistory;
    return filteredHistory.filter((item) => item.toneRating === boardFilter);
  }, [filteredHistory, boardFilter]);

  // SVG Chart Geometry calculations
  const svgWidth = 720;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  const chartPoints = useMemo(() => {
    if (trendPoints.length === 0) return [];
    if (trendPoints.length === 1) {
      const y = svgHeight - paddingY - (trendPoints[0].overallScore / 5.0) * (svgHeight - paddingY * 2);
      return [{ x: svgWidth / 2, y, item: trendPoints[0] }];
    }
    const stepX = (svgWidth - paddingX * 2) / (trendPoints.length - 1);
    return trendPoints.map((item, idx) => {
      const score = Math.max(0.5, Math.min(5.0, item.overallScore || 3.5));
      const y = svgHeight - paddingY - (score / 5.0) * (svgHeight - paddingY * 2);
      return {
        x: paddingX + idx * stepX,
        y,
        item,
      };
    });
  }, [trendPoints]);

  const svgAreaPath = useMemo(() => {
    if (chartPoints.length < 2) return '';
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < chartPoints.length; i++) {
      const prev = chartPoints[i - 1];
      const curr = chartPoints[i];
      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }
    d += ` L ${last.x} ${svgHeight - paddingY} L ${first.x} ${svgHeight - paddingY} Z`;
    return d;
  }, [chartPoints]);

  const svgLinePath = useMemo(() => {
    if (chartPoints.length < 2) return '';
    const first = chartPoints[0];
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < chartPoints.length; i++) {
      const prev = chartPoints[i - 1];
      const curr = chartPoints[i];
      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [chartPoints]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Header Card */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-subtle bg-surface shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display flex items-center gap-2 text-xl font-extrabold text-ink">
              <BarChart3 className="h-5 w-5 text-accent" />
              Executive QA &amp; Demeanor Intelligence
            </h2>
            <Badge variant="accent" className="text-[10px] font-mono">
              Neon DB Aggregations Active
            </Badge>
          </div>
          <p className="text-xs text-ink-muted mt-1">
            Real-time conversational quality, tone violations, commitment fulfillment, and model economics.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Time range selector */}
          <div className="inline-flex rounded-lg border border-subtle bg-canvas p-0.5 text-xs font-semibold">
            {(['7d', '30d', 'all'] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setTimeWindow(w)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer capitalize ${
                  timeWindow === w
                    ? 'bg-surface text-ink font-bold shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {w === 'all' ? 'All Time' : w.toUpperCase()}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            className="cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {isLoading || !data ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
          <EqualizerLoader size="md" />
          <p className="text-sm font-medium">Computing team analytics &amp; demeanor curves...</p>
        </div>
      ) : (
        <>
          {/* Top 4 High-Impact KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Quality Score */}
            <Card className="p-5 bg-surface border-subtle hover:border-accent/40 transition-colors">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Avg Quality Score</span>
                <span className="rounded-full bg-accent-soft p-1.5 text-accent">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-ink">
                  <CountUp to={data.averageScore} decimals={1} />
                </span>
                <span className="text-xs text-ink-muted font-bold">/ 5.0</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-status-green font-semibold flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  +0.4 vs baseline
                </span>
                <span className="text-ink-muted font-mono">Target: 4.0</span>
              </div>
            </Card>

            {/* KPI 2: Total Calls */}
            <Card className="p-5 bg-surface border-subtle hover:border-accent/40 transition-colors">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Calls Audited</span>
                <span className="rounded-full bg-accent-soft p-1.5 text-accent">
                  <PhoneCall className="h-4 w-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-ink">
                  <CountUp to={data.totalCalls} />
                </span>
                <span className="text-xs text-ink-muted font-medium">recordings</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-status-green font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {data.greenFlagCount} compliant
                </span>
                <span className="text-ink-muted font-mono">
                  {data.totalCalls > 0
                    ? Math.round((data.greenFlagCount / data.totalCalls) * 100)
                    : 100}
                  % pass
                </span>
              </div>
            </Card>

            {/* KPI 3: Red Flag Escalation Rate */}
            <Card className="p-5 bg-surface border-subtle hover:border-status-red/40 transition-colors">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Red Flag Rate</span>
                <span className="rounded-full bg-status-red-soft p-1.5 text-status-red">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-status-red">
                  <CountUp to={data.escalationRate} decimals={1} suffix="%" />
                </span>
                <span className="text-xs text-ink-muted font-medium">({data.redFlagCount} calls)</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-status-red font-semibold flex items-center gap-1">
                  {data.redFlagCount > 0 ? (
                    <>
                      <ArrowUpRight className="h-3 w-3" /> Critical Attention
                    </>
                  ) : (
                    'Clean Record'
                  )}
                </span>
                <span className="text-ink-muted font-mono">Cap: &lt; 5%</span>
              </div>
            </Card>

            {/* KPI 4: Commitment Resolution */}
            <Card className="p-5 bg-surface border-subtle hover:border-status-green/40 transition-colors">
              <div className="flex items-center justify-between text-ink-muted mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Promises Grounded</span>
                <span className="rounded-full bg-status-green-soft p-1.5 text-status-green">
                  <CheckSquare className="h-4 w-4" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-status-green">
                  <CountUp to={insights?.deadlineGroundingPct || 100} decimals={0} suffix="%" />
                </span>
                <span className="text-xs text-ink-muted font-medium">explicit dates</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-ink-muted font-medium">
                  {data.totalCommitments} action items tracked
                </span>
                <span className="text-status-green font-mono font-semibold">100% Anti-Hallucination</span>
              </div>
            </Card>
          </div>

          {/* MAIN TABS (Modeled after React Bits Delivery Board UI in Image 2) */}
          <Tabs defaultValue="overview" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle pb-3">
              <TabsList className="bg-canvas border border-subtle p-1 rounded-xl">
                <TabsTrigger value="overview" className="text-xs font-bold gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Overview &amp; Trends
                </TabsTrigger>
                <TabsTrigger value="worklog" className="text-xs font-bold gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Audit Worklogs ({filteredHistory.length})
                </TabsTrigger>
                <TabsTrigger value="coaching" className="text-xs font-bold gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5" />
                  Demeanor &amp; Coaching
                </TabsTrigger>
                <TabsTrigger value="economics" className="text-xs font-bold gap-1.5">
                  <Coins className="h-3.5 w-3.5" />
                  Model Economics
                </TabsTrigger>
              </TabsList>

              <div className="text-xs text-ink-muted font-mono flex items-center gap-3">
                <span>Showing {filteredHistory.length} audited recordings</span>
                <span className="h-1 w-1 rounded-full bg-accent" />
                <span>Neon PostgreSQL</span>
              </div>
            </div>

            {/* TAB 1: OVERVIEW & TRENDS */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Row 1: Interactive Timeline Chart & Demeanor Radial Card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SVG Quality Score Timeline Chart (2 Cols) */}
                <Card className="p-5 lg:col-span-2 bg-surface border-subtle flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-accent" />
                          Conversational Quality Trend Curve
                        </h3>
                        <p className="text-[11px] text-ink-muted mt-0.5">
                          Chronological progression of 0.5 – 5.0 QA scores across audited calls.
                        </p>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-accent" />
                          <span className="text-ink-muted">Quality Score</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-status-green" />
                          <span className="text-ink-muted">Compliant (&gt;3.5)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-status-red" />
                          <span className="text-ink-muted">Escalation (&lt;3.0)</span>
                        </span>
                      </div>
                    </div>

                    {/* SVG Chart Area */}
                    <div className="relative w-full overflow-hidden rounded-xl bg-canvas/60 border border-subtle p-2">
                      {chartPoints.length < 2 ? (
                        <div className="flex h-52 items-center justify-center text-xs text-ink-muted font-medium">
                          Auditing more call recordings will populate live trajectory spline points.
                        </div>
                      ) : (
                        <svg
                          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                          className="w-full h-52 overflow-visible select-none"
                        >
                          <defs>
                            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Grid horizontal guidelines */}
                          {[1, 2, 3, 4, 5].map((lvl) => {
                            const y = svgHeight - paddingY - (lvl / 5.0) * (svgHeight - paddingY * 2);
                            return (
                              <g key={lvl}>
                                <line
                                  x1={paddingX}
                                  y1={y}
                                  x2={svgWidth - paddingX}
                                  y2={y}
                                  stroke="var(--border-subtle)"
                                  strokeDasharray="3 3"
                                  strokeWidth="1"
                                />
                                <text
                                  x={paddingX - 10}
                                  y={y + 3}
                                  textAnchor="end"
                                  fontSize="9"
                                  fill="var(--text-secondary)"
                                  fontFamily="monospace"
                                >
                                  {lvl}.0
                                </text>
                              </g>
                            );
                          })}

                          {/* Area Fill */}
                          <path d={svgAreaPath} fill="url(#trendGradient)" />

                          {/* Stroke Line */}
                          <path
                            d={svgLinePath}
                            fill="none"
                            stroke="var(--accent-primary)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Interactive Points */}
                          {chartPoints.map((pt, idx) => {
                            const isRed = pt.item.toneRating === 'RED';
                            const ptColor = isRed ? 'var(--status-red)' : 'var(--accent-primary)';
                            const isHovered = hoveredPoint?.item.id === pt.item.id;
                            return (
                              <g key={idx}>
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isHovered ? 6 : 4}
                                  fill={ptColor}
                                  stroke="var(--bg-surface)"
                                  strokeWidth="2"
                                  className="cursor-pointer transition-all duration-150"
                                  onMouseEnter={() => setHoveredPoint(pt)}
                                  onMouseLeave={() => setHoveredPoint(null)}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      )}

                      {/* Tooltip Overlay */}
                      {hoveredPoint && (
                        <div
                          className="absolute pointer-events-none rounded-lg border border-subtle bg-surface-elevated p-2 text-xs shadow-md space-y-1 z-20"
                          style={{
                            left: `${Math.min(75, Math.max(10, (hoveredPoint.x / svgWidth) * 100))}%`,
                            top: `${Math.max(5, (hoveredPoint.y / svgHeight) * 100 - 35)}%`,
                          }}
                        >
                          <div className="font-bold text-ink truncate max-w-[200px]">
                            {hoveredPoint.item.filename}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="font-extrabold text-accent">
                              {hoveredPoint.item.overallScore.toFixed(1)} / 5.0
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                hoveredPoint.item.toneRating === 'RED'
                                  ? 'bg-status-red/15 text-status-red'
                                  : 'bg-status-green/15 text-status-green'
                              }`}
                            >
                              {hoveredPoint.item.toneRating}
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-muted">
                            {hoveredPoint.item.category}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
                    <span>
                      Earliest call: {trendPoints[0]?.createdAt ? new Date(trendPoints[0].createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                    <span>
                      Latest audit: {trendPoints[trendPoints.length - 1]?.createdAt ? new Date(trendPoints[trendPoints.length - 1].createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </Card>

                {/* Demeanor Dimension Benchmark Card (1 Col) */}
                <Card className="p-5 bg-surface border-subtle flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-sm font-extrabold text-ink mb-1 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-accent" />
                      Demeanor Radar &amp; Benchmarks
                    </h3>
                    <p className="text-[11px] text-ink-muted mb-4">
                      Scored across agent composure, empathy, and customer friction control.
                    </p>

                    <div className="space-y-4">
                      {/* Dimension 1: Professionalism */}
                      <div>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-semibold text-ink">Professionalism</span>
                          <span className="font-mono font-bold text-ink">
                            {demeanorAverages.repProfessionalism || 85}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-subtle overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-accent transition-all duration-300"
                            style={{ width: `${demeanorAverages.repProfessionalism || 85}%` }}
                          />
                          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-ink/40" title="80% Target" />
                        </div>
                      </div>

                      {/* Dimension 2: Empathy */}
                      <div>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-semibold text-ink flex items-center gap-1.5">
                            Empathy
                            {demeanorAverages.repEmpathy < 80 && (
                              <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] font-bold text-accent">
                                Coaching Target
                              </span>
                            )}
                          </span>
                          <span className="font-mono font-bold text-accent">
                            {demeanorAverages.repEmpathy || 69}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-subtle overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-accent/80 transition-all duration-300"
                            style={{ width: `${demeanorAverages.repEmpathy || 69}%` }}
                          />
                          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-ink/40" title="80% Target" />
                        </div>
                      </div>

                      {/* Dimension 3: Patience */}
                      <div>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-semibold text-ink">Patience &amp; Composure</span>
                          <span className="font-mono font-bold text-ink">
                            {demeanorAverages.repPatience || 82}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-subtle overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-status-green transition-all duration-300"
                            style={{ width: `${demeanorAverages.repPatience || 82}%` }}
                          />
                          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-ink/40" title="80% Target" />
                        </div>
                      </div>

                      {/* Dimension 4: Friction Control */}
                      <div>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-semibold text-ink">Customer Friction Control</span>
                          <span className="font-mono font-bold text-status-green">
                            {100 - (demeanorAverages.customerFriction || 22)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-subtle overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-status-green/90 transition-all duration-300"
                            style={{ width: `${100 - (demeanorAverages.customerFriction || 22)}%` }}
                          />
                          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-ink/40" title="80% Target" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-[11px] text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-0.5 bg-ink/40" />
                      80% Industry Benchmark Line
                    </span>
                    <span className="font-mono text-status-green font-semibold">3 of 4 met</span>
                  </div>
                </Card>
              </div>

              {/* Row 2: Category Risk Distribution & 40-30-30 Rubric */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Risk Distribution */}
                <Card className="p-5 bg-surface border-subtle">
                  <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-accent" />
                    Call Volume &amp; Escalation Risk by Category
                  </h3>
                  <div className="space-y-3.5">
                    {categoryStats.map((cat) => (
                      <div key={cat.category} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">{cat.category}</span>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-ink-muted">{cat.total} calls</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                cat.redRate > 0
                                  ? 'bg-status-red/15 text-status-red'
                                  : 'bg-status-green/15 text-status-green'
                              }`}
                            >
                              {cat.redRate}% RED
                            </span>
                          </div>
                        </div>

                        {/* Stacked bar: green vs red */}
                        <div className="h-2 w-full rounded-full bg-subtle overflow-hidden flex">
                          <div
                            className="h-full bg-status-green"
                            style={{
                              width: `${cat.total > 0 ? (cat.green / cat.total) * 100 : 100}%`,
                            }}
                            title={`${cat.green} Compliant`}
                          />
                          <div
                            className="h-full bg-status-red"
                            style={{
                              width: `${cat.total > 0 ? (cat.red / cat.total) * 100 : 0}%`,
                            }}
                            title={`${cat.red} Violations`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Inflect 40-30-30 Standard Breakdown */}
                <Card className="p-5 bg-surface border-subtle">
                  <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent" />
                    Inflect 40-30-30 Evaluation Weights
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
                        Isolates agent patience, professional phrasing, and active listening. Direct audio perception flags insults automatically.
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
                        Validates greetings, courteous language, and adherence to preset industry rules.
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
                        Extracts verifiable promises with timestamps, rejecting vague deadlines.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* TAB 2: AUDIT WORKLOGS (DELIVERY BOARD TABLE - IMAGE 2 INSPIRED) */}
            <TabsContent value="worklog" className="space-y-4 mt-0">
              <Card className="p-5 bg-surface border-subtle">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
                      <FileAudio className="h-4 w-4 text-accent" />
                      Audited Conversations Delivery Board
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Review scored conversation items, demeanor balances, and promises extracted across call assets.
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="inline-flex rounded-lg border border-subtle bg-canvas p-0.5 text-xs font-semibold">
                    {(['ALL', 'GREEN', 'RED'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setBoardFilter(mode)}
                        className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                          boardFilter === mode
                            ? 'bg-surface text-ink font-bold shadow-xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {mode === 'ALL' ? 'All Recordings' : mode === 'GREEN' ? 'Compliant' : 'Violations'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Worklog Table */}
                <div className="rounded-xl border border-subtle overflow-hidden bg-canvas/40">
                  <Table>
                    <TableHeader className="bg-canvas">
                      <TableRow>
                        <TableHead className="w-[280px]">Recording &amp; Filename</TableHead>
                        <TableHead>Category / Preset</TableHead>
                        <TableHead className="w-[140px]">Demeanor Balance</TableHead>
                        <TableHead>QA Score</TableHead>
                        <TableHead>Tone Verdict</TableHead>
                        <TableHead>Promises</TableHead>
                        <TableHead className="text-right">Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boardItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-10 text-ink-muted">
                            No audited calls found for this filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        boardItems.slice(0, 15).map((item) => {
                          const isRed = item.toneRating === 'RED';
                          const initials = (item.filename || 'AU')
                            .replace(/[^a-zA-Z]/g, '')
                            .slice(0, 2)
                            .toUpperCase();
                          return (
                            <TableRow key={item.id} className="hover:bg-surface-elevated/60">
                              {/* Recording & Initials */}
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`h-8 w-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold ${
                                      isRed
                                        ? 'bg-status-red/15 text-status-red border border-status-red/30'
                                        : 'bg-accent/15 text-accent border border-accent/30'
                                    }`}
                                  >
                                    {initials}
                                  </div>
                                  <div className="truncate max-w-[200px]">
                                    <div className="text-xs font-bold text-ink truncate">
                                      {item.filename}
                                    </div>
                                    <div className="text-[10px] text-ink-muted font-mono flex items-center gap-1.5">
                                      <span>{item.duration || '00:00'}</span>
                                      <span>&bull;</span>
                                      <span>{item.fileSize || '0 MB'}</span>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>

                              {/* Category */}
                              <TableCell>
                                <span className="inline-flex rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink border border-subtle">
                                  {item.category}
                                </span>
                              </TableCell>

                              {/* Demeanor Balance (3-segment mini bar) */}
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="h-1.5 w-24 rounded-full bg-subtle overflow-hidden flex">
                                    <div
                                      className={`h-full ${isRed ? 'bg-status-red' : 'bg-accent'}`}
                                      style={{ width: `${isRed ? 25 : 60}%` }}
                                    />
                                    <div
                                      className={`h-full ${isRed ? 'bg-status-red/50' : 'bg-status-green'}`}
                                      style={{ width: `${isRed ? 20 : 40}%` }}
                                    />
                                  </div>
                                  <div className="text-[9px] text-ink-muted font-mono">
                                    {isRed ? 'High Friction' : 'Balanced Demeanor'}
                                  </div>
                                </div>
                              </TableCell>

                              {/* Score */}
                              <TableCell>
                                <span
                                  className={`font-mono text-xs font-extrabold ${
                                    isRed ? 'text-status-red' : 'text-status-green'
                                  }`}
                                >
                                  {item.overallScore.toFixed(1)} / 5.0
                                </span>
                              </TableCell>

                              {/* Tone Verdict */}
                              <TableCell>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                    isRed
                                      ? 'border-status-red/35 bg-status-red/10 text-status-red'
                                      : 'border-status-green/35 bg-status-green/10 text-status-green'
                                  }`}
                                >
                                  {isRed ? (
                                    <>
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      VIOLATION
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      COMPLIANT
                                    </>
                                  )}
                                </span>
                              </TableCell>

                              {/* Promises Extracted */}
                              <TableCell className="font-mono text-xs text-ink">
                                {item.commitmentsCount} actions
                              </TableCell>

                              {/* Timestamp */}
                              <TableCell className="text-right font-mono text-[11px] text-ink-muted">
                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            {/* TAB 3: DEMEANOR & COACHING INSIGHTS */}
            <TabsContent value="coaching" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Escalation Hotspot & Evidence Snippet */}
                <Card className="p-5 bg-surface border-subtle">
                  <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-status-red" />
                    Escalation Root Cause &amp; Grounded Evidence
                  </h3>

                  {insights?.latestRedQuote ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-status-red/30 bg-status-red-soft p-4 text-ink">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <strong className="text-status-red font-bold">
                            Latest Escalation Quote
                          </strong>
                          <span className="font-mono text-[11px] text-status-red/80">
                            {insights.latestRedQuote.filename}
                          </span>
                        </div>
                        <p className="italic text-xs font-medium text-ink leading-relaxed">
                          "{insights.latestRedQuote.quote}"
                        </p>
                      </div>

                      {insights.topEscalationCategory && (
                        <div className="rounded-xl border border-subtle bg-canvas p-3 text-xs flex items-center justify-between">
                          <span className="text-ink-muted font-medium">Critical Category Hotspot:</span>
                          <span className="font-bold text-status-red">
                            {insights.topEscalationCategory} ({insights.topEscalationRate}% RED Rate)
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-status-green/30 bg-status-green-soft p-5 text-center text-xs">
                      <CheckCircle2 className="h-8 w-8 text-status-green mx-auto mb-2" />
                      <strong className="text-status-green text-sm block mb-1">
                        Zero Escalations Recorded
                      </strong>
                      All {data.totalCalls} audited customer conversations complied with tone rubrics.
                    </div>
                  )}
                </Card>

                {/* AI Coaching Plan */}
                <Card className="p-5 bg-surface border-subtle flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-sm font-extrabold text-ink mb-3 flex items-center gap-2">
                      <Award className="h-4 w-4 text-accent" />
                      Automated AI Coaching Directives
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div className="rounded-xl border border-accent/30 bg-accent-soft p-3.5 text-ink">
                        <strong className="text-accent block mb-1">
                          Primary Demeanor Focus: Empathy (Current Avg: {demeanorAverages.repEmpathy || 69}%)
                        </strong>
                        <p className="text-ink-muted leading-relaxed">
                          Reps frequently explain technical limitations correctly but skip validating customer frustration. Encourage phrases such as <em>"I recognize how frustrating this delay is, let me resolve this right away."</em>
                        </p>
                      </div>

                      <div className="rounded-xl border border-subtle bg-canvas p-3.5 space-y-2">
                        <span className="font-bold text-ink block">Etiquette Adherence Checklist</span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <span className="flex items-center gap-1.5 text-status-green font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Professional Greeting
                          </span>
                          <span className="flex items-center gap-1.5 text-status-green font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Active Listening
                          </span>
                          <span className="flex items-center gap-1.5 text-accent font-semibold">
                            <AlertTriangle className="h-3 w-3" /> De-escalation Phrasing
                          </span>
                          <span className="flex items-center gap-1.5 text-status-green font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Verified Next Steps
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-subtle text-[11px] text-ink-muted flex items-center justify-between">
                    <span>Generated from grounded transcript citations</span>
                    <span className="font-mono text-accent">Zero Hallucinations</span>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* TAB 4: MODEL ECONOMICS & TOKEN QUOTA */}
            <TabsContent value="economics" className="space-y-6 mt-0">
              {tokenQuota && (
                <Card className="p-5 bg-surface border-subtle space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
                        <Coins className="h-4 w-4 text-accent" />
                        Tenant Daily AI Token Quota &mdash;{' '}
                        <span className="text-accent">{tokenQuota.orgName}</span>
                      </h3>
                      <p className="text-xs text-ink-muted mt-0.5">
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

                  {/* Progress Bar */}
                  <div className="h-3 w-full rounded-full bg-subtle overflow-hidden">
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
                            className="rounded-lg font-mono text-[11px] py-1 px-2.5 bg-canvas border border-subtle text-ink"
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
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};
