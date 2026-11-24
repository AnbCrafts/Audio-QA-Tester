import React from 'react';
import { Sliders, Sparkles, Activity } from 'lucide-react';
import { BusinessPreset } from '../types';

interface NavbarProps {
  activePreset: BusinessPreset;
  onOpenConfig: () => void;
  isBackendConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activePreset,
  onOpenConfig,
  isBackendConnected,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/85 backdrop-blur-md">
      <div className="mx-auto flex w-[90%] items-center justify-between py-3.5">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 font-black text-lg">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-white">SCALEWORKS AI</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/30">
                Call Quality Agent
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Forward Deployed Engineer • Automated QA & Tone Evaluation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Backend Connection Status Badge */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
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
            <span>{isBackendConnected ? 'AI Engine Ready' : 'Connecting to Backend...'}</span>
          </div>

          {/* Active Preset Tag */}
          <button
            onClick={onOpenConfig}
            className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Preset: <strong className="text-white">{activePreset.name}</strong></span>
          </button>

          {/* Config Trigger */}
          <button
            onClick={onOpenConfig}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <Sliders className="h-4 w-4" />
            <span>Configure Agent</span>
          </button>
        </div>
      </div>
    </header>
  );
};
