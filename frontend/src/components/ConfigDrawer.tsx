import React, { useState } from 'react';
import { X, Sliders, Sparkles, Shield, Cpu, Info, Check, RefreshCw } from 'lucide-react';
import { AnalysisConfig, BusinessPreset, SensitivityLevel, ActionItemScope } from '../types';
import { BUSINESS_PRESETS } from '../data/presets';

interface ConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: AnalysisConfig;
  onSaveConfig: (newConfig: AnalysisConfig) => void;
  hasLoadedCall?: boolean;
  onReanalyzeLoadedCall?: (newConfig: AnalysisConfig) => void;
}

export const ConfigDrawer: React.FC<ConfigDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  hasLoadedCall = false,
  onReanalyzeLoadedCall,
}) => {
  const [localConfig, setLocalConfig] = useState<AnalysisConfig>(config);
  const [newPhrase, setNewPhrase] = useState('');

  if (!isOpen) return null;

  const handlePresetChange = (preset: BusinessPreset) => {
    setLocalConfig((prev) => ({
      ...prev,
      presetId: preset.id,
      presetName: preset.name,
      toneCriteria: preset.defaultToneCriteria,
      sensitivity: preset.defaultSensitivity,
      actionItemScope: preset.defaultActionItemScope,
    }));
  };

  const handleAddPhrase = () => {
    if (newPhrase.trim() && !localConfig.customForbiddenPhrases.includes(newPhrase.trim())) {
      setLocalConfig((prev) => ({
        ...prev,
        customForbiddenPhrases: [...prev.customForbiddenPhrases, newPhrase.trim()],
      }));
      setNewPhrase('');
    }
  };

  const handleRemovePhrase = (phrase: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      customForbiddenPhrases: prev.customForbiddenPhrases.filter((p) => p !== phrase),
    }));
  };

  const handleApply = () => {
    onSaveConfig(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="relative flex h-full w-full max-w-xl flex-col bg-slate-900 border-l border-slate-800 shadow-2xl p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Agent Analysis Settings</h2>
              <p className="text-xs text-slate-400">
                Configure tone criteria, rubrics, and sensitivity for any business type
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-6 flex-1 space-y-6 text-sm">
          {/* Section 1: Business Presets (Multi-Business adaptability) */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              1. Business Domain Presets
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {BUSINESS_PRESETS.map((preset) => {
                const isSelected = localConfig.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetChange(preset)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 text-white shadow-sm'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-semibold text-xs text-white">{preset.name}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-amber-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 leading-tight">
                      {preset.industry}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Tone Criteria & Rubric */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-amber-400" />
                2. Tone Evaluation Rubric (Prompt Grounding)
              </label>
              <button
                type="button"
                onClick={() => {
                  const currentPreset = BUSINESS_PRESETS.find(p => p.id === localConfig.presetId);
                  if (currentPreset) {
                    setLocalConfig(prev => ({ ...prev, toneCriteria: currentPreset.defaultToneCriteria }));
                  }
                }}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Reset to preset default
              </button>
            </div>
            <textarea
              value={localConfig.toneCriteria}
              onChange={(e) =>
                setLocalConfig((prev) => ({ ...prev, toneCriteria: e.target.value }))
              }
              rows={4}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 font-sans"
              placeholder="Define exact behavior that triggers a RED or GREEN rating..."
            />
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />
              This is fed directly to the LLM system prompt to evaluate only the representative.
            </p>
          </div>

          {/* Section 3: Sensitivity Level */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">
              3. Flag Sensitivity Threshold
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'balanced', 'strict'] as SensitivityLevel[]).map((level) => {
                const isSelected = localConfig.sensitivity === level;
                return (
                  <button
                    key={level}
                    onClick={() => setLocalConfig((prev) => ({ ...prev, sensitivity: level }))}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold capitalize transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {localConfig.sensitivity === 'low' && 'Only flags explicit aggression, overt slurs, or extreme hostility.'}
              {localConfig.sensitivity === 'balanced' && 'Flags sarcasm, dismissiveness, or persistent condescension.'}
              {localConfig.sensitivity === 'strict' && 'Flags any impatience, interrupting, or reluctant responses.'}
            </p>
          </div>

          {/* Section 4: Action Item Grounding Scope */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">
              4. Action Item Extraction Scope
            </label>
            <div className="space-y-2">
              {[
                {
                  id: 'explicit_commitments',
                  label: 'Concrete Commitments Only (Recommended)',
                  desc: 'Extracts only explicit promises supported by quotes; strictly avoids fabricating deadlines.',
                },
                {
                  id: 'strict_deadlines_only',
                  label: 'Strict Time-Bound Commitments Only',
                  desc: 'Only extracts actions with explicit dates or time constraints.',
                },
                {
                  id: 'all_followups',
                  label: 'Broad Follow-ups & Next Steps',
                  desc: 'Includes aspirational next steps discussed between both parties.',
                },
              ].map((scope) => {
                const isSelected = localConfig.actionItemScope === scope.id;
                return (
                  <div
                    key={scope.id}
                    onClick={() =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        actionItemScope: scope.id as ActionItemScope,
                      }))
                    }
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-amber-400/80 bg-amber-500/5 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-slate-950" />}
                      </div>
                      <span className="text-xs font-bold text-white">{scope.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 ml-6">{scope.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Custom Trigger / Forbidden Phrases */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">
              5. Custom Monitored Phrases (Optional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPhrase())}
                placeholder="Add phrase (e.g. 'not my problem')..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPhrase}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 cursor-pointer"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localConfig.customForbiddenPhrases.map((phrase) => (
                <span
                  key={phrase}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-[11px] text-slate-300"
                >
                  "{phrase}"
                  <button
                    onClick={() => handleRemovePhrase(phrase)}
                    className="text-slate-400 hover:text-rose-400 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Section 6: AI Engine & Fallback */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
              <Cpu className="h-4 w-4 text-amber-400" />
              6. AI Engine & Dual-Engine Fallback
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setLocalConfig((prev) => ({ ...prev, aiProvider: 'gemini' }))}
                className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all ${
                  localConfig.aiProvider === 'gemini'
                    ? 'border-amber-400 bg-amber-500/10 text-white'
                    : 'border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Gemini 2.0 / 1.5</span>
                  <span className="text-[10px] text-amber-400 font-mono">PRIMARY</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Direct multimodal audio & reasoning</p>
              </button>
              <button
                onClick={() => setLocalConfig((prev) => ({ ...prev, aiProvider: 'groq' }))}
                className={`p-2.5 rounded-lg border text-xs font-bold text-left transition-all ${
                  localConfig.aiProvider === 'groq'
                    ? 'border-amber-400 bg-amber-500/10 text-white'
                    : 'border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Groq (Llama-3.3)</span>
                  <span className="text-[10px] text-emerald-400 font-mono">FALLBACK</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Ultra-fast inference fallback</p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleApply}
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              Save Settings
            </button>
            {hasLoadedCall && onReanalyzeLoadedCall && (
              <button
                onClick={() => {
                  onSaveConfig(localConfig);
                  onReanalyzeLoadedCall(localConfig);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-amber-300 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                ⚡ Re-Analyze Loaded Call (~350ms)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
