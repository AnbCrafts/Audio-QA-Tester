import React from 'react';
import {
  Sliders,
  Headphones,
  History,
  CheckSquare,
  BarChart3,
  Coins,
  LogOut,
  Building2,
  Shield,
} from 'lucide-react';
import { BusinessPreset, OrgTokenQuota, UserProfile } from '@/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InflectLogo } from '@/components/InflectLogo';

export type AppNavTab = 'auditor' | 'history' | 'commitments' | 'analytics' | 'admin';

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
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`;

  const navItems: Array<{ id: AppNavTab; label: string; icon: React.ReactNode }> = [
    { id: 'auditor', label: 'Live Auditor', icon: <Headphones className="h-3.5 w-3.5" /> },
    { id: 'history', label: 'Call History', icon: <History className="h-3.5 w-3.5" /> },
    { id: 'commitments', label: 'Commitments', icon: <CheckSquare className="h-3.5 w-3.5" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({ id: 'admin', label: 'Admin', icon: <Shield className="h-3.5 w-3.5" /> });
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-subtle bg-surface/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex w-[94%] max-w-7xl items-center justify-between gap-2 py-2.5">
        {/* Brand */}
        <div
          className="flex items-center gap-2.5 shrink-0 cursor-pointer"
          onClick={() => onTabChange('auditor')}
        >
          <InflectLogo size="sm" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-sm font-extrabold tracking-tight text-ink">
                INFLECT
              </span>
              <span className="hidden xl:inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent border border-accent/30">
                Call QA
              </span>
            </div>
            <p className="text-[10px] text-ink-muted hidden 2xl:block">
              Conversation Intelligence &amp; Demeanor Auditor
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center overflow-x-auto rounded-xl border border-subtle bg-canvas p-1 text-xs">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 lg:px-2.5 py-1.5 font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle compact />

          {/* Per-Tenant Daily Token Quota Pill */}
          {tokenQuota && (
            <button
              type="button"
              onClick={() => onTabChange('analytics')}
              title={
                tokenQuota.isExhausted
                  ? `Daily token quota exhausted. Renews at ${new Date(
                      tokenQuota.renewsAtUtc
                    ).toLocaleString()}`
                  : `${tokenQuota.remainingToday.toLocaleString()} tokens remaining today`
              }
              className={`hidden 2xl:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono font-bold border cursor-pointer transition-all ${
                tokenQuota.isExhausted
                  ? 'bg-status-red-soft text-status-red border-status-red/35'
                  : tokenQuota.usagePct >= 80
                  ? 'bg-accent-soft text-accent border-accent/35'
                  : 'bg-canvas text-ink border-subtle hover:border-accent'
              }`}
            >
              <Coins className="h-3.5 w-3.5 text-accent" />
              <span>
                {formatCompactTokens(tokenQuota.usedToday)} /{' '}
                {formatCompactTokens(tokenQuota.dailyLimit)}
              </span>
            </button>
          )}

          {/* Workspace Badge */}
          {user && (
            <div className="hidden xl:flex items-center gap-1.5 rounded-xl bg-canvas px-2.5 py-1.5 text-[11px] text-ink border border-subtle">
              <Building2 className="h-3.5 w-3.5 text-accent" />
              <span className="font-semibold truncate max-w-[100px]">{user.orgName}</span>
            </div>
          )}

          {/* Backend Status */}
          <div
            title={isBackendConnected ? 'AI Engine Ready' : 'Connecting...'}
            className={`hidden md:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border ${
              isBackendConnected
                ? 'bg-status-green-soft text-status-green border-status-green/30'
                : 'bg-accent-soft text-accent border-accent/30'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isBackendConnected ? 'bg-status-green animate-pulse' : 'bg-accent'
              }`}
            />
            <span className="hidden xl:inline">
              {isBackendConnected ? 'Ready' : 'Connecting'}
            </span>
          </div>

          {/* Config Trigger */}
          <button
            type="button"
            onClick={onOpenConfig}
            className="flex items-center gap-1.5 rounded-xl bg-surface-elevated px-2.5 py-1.5 text-xs font-bold text-ink hover:border-accent hover:text-accent border border-subtle transition-all cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5 text-accent" />
            <span className="hidden lg:inline">Configure</span>
          </button>

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title={`Sign out (${user.email})`}
              className="rounded-xl bg-surface-elevated p-2 text-ink-muted hover:text-status-red hover:border-status-red/40 border border-subtle transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
