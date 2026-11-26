import React from 'react';
import { Sliders, Headphones, History, CheckSquare, BarChart3, Coins, LogOut, Building2 } from 'lucide-react';
import { BusinessPreset, OrgTokenQuota, UserProfile } from '../types';

export type AppNavTab = 'auditor' | 'history' | 'commitments' | 'analytics';

interface NavbarProps {
  activePreset: BusinessPreset;
  onOpenConfig: () => void;
  isBackendConnected: boolean;
  activeTab: AppNavTab;
  onTabChange: (tab: AppNavTab) => void;
  user: UserProfile | null;
  tokenQuota: OrgTokenQuota | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenConfig,
  isBackendConnected,
  activeTab,
  onTabChange,
  user,
  tokenQuota,
  onLogout,
}) => {
  const formatCompactTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex w-[92%] items-center justify-between py-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 font-black text-lg cursor-pointer"
               onClick={() => onTabChange('auditor')}>
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white cursor-pointer" onClick={() => onTabChange('auditor')}>
                SCALEWORKS AI
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
                Enterprise QA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Forward Deployed Engineer • Automated QA &amp; Demeanor Auditor
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center rounded-xl border border-slate-800 bg-slate-900/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => onTabChange('auditor')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
              activeTab === 'auditor'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>Live Auditor</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('history')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Call History</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('commitments')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
              activeTab === 'commitments'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Commitments</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('analytics')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Analytics</span>
          </button>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Per-Tenant Daily Token Quota Pill */}
          {tokenQuota && (
            <button
              type="button"
              onClick={() => onTabChange('analytics')}
              title={
                tokenQuota.isExhausted
                  ? `Daily token quota exhausted. Renews at ${new Date(tokenQuota.renewsAtUtc).toLocaleString()}`
                  : `${tokenQuota.remainingToday.toLocaleString()} tokens remaining today`
              }
              className={`hidden xl:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono font-semibold border cursor-pointer transition-all ${
                tokenQuota.isExhausted
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  : tokenQuota.usagePct >= 80
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-500/40'
              }`}
            >
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span>
                {formatCompactTokens(tokenQuota.usedToday)} / {formatCompactTokens(tokenQuota.dailyLimit)}
              </span>
            </button>
          )}

          {/* Workspace Badge */}
          {user && (
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 border border-slate-800">
              <Building2 className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-semibold truncate max-w-[110px]">{user.orgName}</span>
            </div>
          )}

          {/* Backend Status */}
          <div
            className={`hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              isBackendConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isBackendConnected ? 'AI Engine Ready' : 'Connecting...'}</span>
          </div>

          {/* Config Trigger */}
          <button
            onClick={onOpenConfig}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-amber-400 border border-slate-800 transition-all cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Configure</span>
          </button>

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title={`Sign out (${user.email})`}
              className="rounded-lg bg-slate-900 p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-400 border border-slate-800 transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
