import React, { useState, useEffect } from 'react';
import { Sliders, Sparkles, Shield, Cpu, Info, Check, RefreshCw } from 'lucide-react';
import {
  AnalysisConfig,
  BusinessPreset,
  SensitivityLevel,
  ActionItemScope,
} from '@/types';
import { BUSINESS_PRESETS } from '@/data/presets';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

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

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
    }
  }, [isOpen, config]);

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
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-subtle pb-4 pr-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/30">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <SheetTitle className="font-display text-base font-extrabold text-ink">
              Agent Analysis Settings
            </SheetTitle>
            <SheetDescription className="text-xs text-ink-muted">
              Configure tone criteria, rubrics, and sensitivity for any business type
            </SheetDescription>
          </div>
        </div>

        {/* Content Body */}
        <div className="mt-6 flex-1 space-y-6 text-sm">
          {/* 1. Business Presets */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-2.5">
              <Sparkles className="h-4 w-4 text-accent" />
              1. Business Domain Presets
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {BUSINESS_PRESETS.map((preset) => {
                const isSelected = localConfig.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent-soft text-ink shadow-xs'
                        : 'border-subtle bg-canvas/70 text-ink-muted hover:border-accent/50 hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs text-ink">{preset.name}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                    <span className="text-[11px] text-ink-muted leading-tight">
                      {preset.industry}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Tone Rubric */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-accent" />
                2. Tone Evaluation Rubric (Guarded)
              </label>
              <button
                type="button"
                onClick={() => {
                  const currentPreset = BUSINESS_PRESETS.find(
                    (p) => p.id === localConfig.presetId
                  );
                  if (currentPreset) {
                    setLocalConfig((prev) => ({
                      ...prev,
                      toneCriteria: currentPreset.defaultToneCriteria,
                    }));
                  }
                }}
                className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Reset default
              </button>
            </div>
            <Textarea
              value={localConfig.toneCriteria}
              onChange={(e) =>
                setLocalConfig((prev) => ({ ...prev, toneCriteria: e.target.value }))
              }
              rows={4}
              placeholder="Define exact behavior that triggers a RED or GREEN rating..."
            />
            <p className="text-[11px] text-ink-muted mt-1 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0 text-accent" />
              Protected by 4-layer negative-prompt injection guards; evaluates representative only.
            </p>
          </div>

          {/* 3. Sensitivity */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2 block">
              3. Flag Sensitivity Threshold
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'balanced', 'strict'] as SensitivityLevel[]).map((level) => {
                const isSelected = localConfig.sensitivity === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setLocalConfig((prev) => ({ ...prev, sensitivity: level }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent text-accent-fg shadow-xs'
                        : 'border-subtle bg-canvas text-ink-muted hover:text-ink'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-muted mt-1.5">
              {localConfig.sensitivity === 'low' &&
                'Only flags explicit aggression, overt slurs, or extreme hostility.'}
              {localConfig.sensitivity === 'balanced' &&
                'Flags sarcasm, dismissiveness, or persistent condescension.'}
              {localConfig.sensitivity === 'strict' &&
                'Flags any impatience, interrupting, or reluctant responses.'}
            </p>
          </div>

          {/* 4. Action Item Scope */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2 block">
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
                        ? 'border-accent bg-accent-soft text-ink'
                        : 'border-subtle bg-canvas/70 text-ink-muted hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-accent bg-accent' : 'border-strong'
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-accent-fg" />}
                      </div>
                      <span className="text-xs font-bold text-ink">{scope.label}</span>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-1 ml-6">{scope.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 5. Forbidden Phrases */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2 block">
              5. Custom Monitored Phrases (Optional)
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                type="text"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPhrase())}
                placeholder="Add phrase (e.g. 'not my problem')..."
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddPhrase}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localConfig.customForbiddenPhrases.map((phrase) => (
                <span
                  key={phrase}
                  className="inline-flex items-center gap-1 rounded-full bg-canvas border border-subtle px-2.5 py-0.5 text-[11px] text-ink"
                >
                  "{phrase}"
                  <button
                    type="button"
                    onClick={() => handleRemovePhrase(phrase)}
                    className="text-ink-muted hover:text-status-red ml-1 cursor-pointer"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 6. AI Engine */}
          <div className="rounded-xl border border-subtle bg-canvas p-3.5">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5 mb-2">
              <Cpu className="h-4 w-4 text-accent" />
              6. AI Engine &amp; Dual-Engine Fallback
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocalConfig((prev) => ({ ...prev, aiProvider: 'gemini' }))}
                className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                  localConfig.aiProvider === 'gemini'
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-subtle bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Gemini 2.0 / 2.5</span>
                  <span className="text-[10px] text-accent font-mono">PRIMARY</span>
                </div>
                <p className="text-[10px] text-ink-muted mt-0.5 font-normal">
                  Direct multimodal audio &amp; reasoning
                </p>
              </button>
              <button
                type="button"
                onClick={() => setLocalConfig((prev) => ({ ...prev, aiProvider: 'groq' }))}
                className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                  localConfig.aiProvider === 'groq'
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-subtle bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Groq (Llama-3.3)</span>
                  <span className="text-[10px] text-status-green font-mono">FALLBACK</span>
                </div>
                <p className="text-[10px] text-ink-muted mt-0.5 font-normal">
                  Whisper timestamps &amp; fast fallback
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex items-center gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={handleApply}>
              Save Settings
            </Button>
            {hasLoadedCall && onReanalyzeLoadedCall && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onSaveConfig(localConfig);
                  onReanalyzeLoadedCall(localConfig);
                  onClose();
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Re-Analyze Loaded Call (~350ms)
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
