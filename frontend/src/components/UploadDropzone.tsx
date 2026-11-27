import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  FileAudio,
  Paperclip,
  Sliders,
  Sparkles,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { animate, stagger } from 'animejs';
import { BusinessPreset, SensitivityLevel } from '@/types';
import { prefersReducedMotion } from '@/lib/animations';

interface UploadDropzoneProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  processingStep: string;
  progressPct?: number;
  activePreset?: BusinessPreset;
  activeSensitivity?: SensitivityLevel;
  onOpenConfig?: () => void;
  stagedFile?: File | null;
  onStageFile?: (file: File | null) => void;
}

const WAVEFORM_HEIGHTS = [
  24, 48, 32, 68, 42, 86, 54, 30, 74, 92, 46, 62, 80, 38,
  72, 95, 58, 36, 84, 52, 66, 34, 78, 44, 60, 28, 50, 22,
];

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileUpload,
  isProcessing,
  processingStep,
  progressPct = 0,
  activePreset,
  activeSensitivity = 'balanced',
  onOpenConfig,
  stagedFile = null,
  onStageFile,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  // Elapsed processing timer (`0:00` style like AI Chat 8)
  useEffect(() => {
    if (!isProcessing) {
      setElapsedSec(0);
      return;
    }
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isProcessing]);

  // Animate 28-bar acoustic waveform cleanly during drag-over or processing
  useEffect(() => {
    if (!waveformRef.current || prefersReducedMotion()) return;
    const bars = Array.from(waveformRef.current.querySelectorAll('.composer-wave-bar'));
    if (!bars.length) return;

    if (isProcessing || isDragOver) {
      try {
        const anim = animate(bars, {
          scaleY: [
            { to: 1.0, duration: 280 },
            { to: 0.28, duration: 360 },
          ],
          delay: stagger(45, { from: 'center' }),
          loop: true,
          alternate: true,
          ease: 'inOutSine',
        });
        return () => {
          if (anim && typeof anim.pause === 'function') anim.pause();
        };
      } catch {
        return;
      }
    } else {
      // Gentle reset to static natural heights
      try {
        animate(bars, {
          scaleY: 1,
          duration: 300,
          ease: 'outQuad',
        });
      } catch {
        // ignore
      }
    }
  }, [isProcessing, isDragOver]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getActiveStageIndex = () => {
    const s = processingStep.toLowerCase();
    if (s.includes('completed') || s.includes('extracting') || s.includes('commitment')) return 3;
    if (
      s.includes('merging') ||
      s.includes('auditing') ||
      s.includes('re-evaluating') ||
      s.includes('isolating') ||
      s.includes('scoring')
    ) {
      return 2;
    }
    if (
      s.includes('splitting') ||
      s.includes('segment') ||
      s.includes('transcribing') ||
      s.includes('turns') ||
      s.includes('diarization')
    ) {
      return 1;
    }
    return 0;
  };

  const activeStage = getActiveStageIndex();

  const stages = [
    '01 Fingerprint & Cache',
    '02 Diarize Audio',
    '03 Demeanor Audit',
    '04 Extract Commitments',
  ];

  const validateAndStageOrProcess = (file: File, autoStart = false) => {
    setErrorMsg(null);
    const validExtensions = ['.m4a', '.mp3', '.wav', '.ogg', '.webm', '.aac', '.flac'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setErrorMsg('Supported formats: .m4a, .mp3, .wav, .ogg, .webm, .aac, .flac.');
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setErrorMsg('Audio file exceeds the 500 MB limit.');
      return;
    }

    if (autoStart) {
      onFileUpload(file);
    } else if (onStageFile) {
      onStageFile(file);
    } else {
      onFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!isProcessing && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndStageOrProcess(e.dataTransfer.files[0], false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndStageOrProcess(e.target.files[0], false);
      e.target.value = '';
    }
  };

  const handleLoadSample = async (url: string, filename: string, autoStart = true) => {
    try {
      setErrorMsg(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not fetch sample audio');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'audio/mp4' });
      validateAndStageOrProcess(file, autoStart);
    } catch (e: any) {
      setErrorMsg(`Failed to load sample call: ${e.message}`);
    }
  };

  const handlePrimarySubmit = () => {
    if (isProcessing) return;
    if (stagedFile) {
      onFileUpload(stagedFile);
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isProcessing) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`w-full rounded-3xl border bg-surface p-6 sm:p-8 shadow-sm transition-all ${
        isDragOver
          ? 'border-accent ring-2 ring-accent/25'
          : 'border-subtle'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".m4a,.mp3,.wav,.ogg,.webm,.aac,.flac,audio/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Quiet Top Status Header (AI Chat 8 rhythm) */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted">Audio QA Composer</span>

        {isProcessing ? (
          <div className="inline-flex items-center gap-2 font-mono text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span className="text-ink font-semibold">Analyzing</span>
            <span>{formatTimer(elapsedSec)}</span>
            {progressPct > 0 && (
              <span className="text-accent font-bold">&bull; {progressPct}%</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenConfig}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted hover:text-accent transition-colors cursor-pointer"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span>
              {activePreset?.name || 'B2B SaaS Sales'} &bull; {activeSensitivity.toUpperCase()}
            </span>
          </button>
        )}
      </div>

      {/* Centered Editorial Copy + Live Acoustic Waveform */}
      <div className="mx-auto max-w-xl py-8 sm:py-10 text-center space-y-7">
        <p className="font-display text-lg sm:text-xl font-medium leading-snug text-ink min-h-[3.2rem] flex items-center justify-center px-2">
          {isProcessing
            ? processingStep || 'Decoding audio stream, separating speakers, and verifying commitments...'
            : isDragOver
            ? 'Release to stage this call recording for quality and demeanor auditing.'
            : stagedFile
            ? `Ready to evaluate "${stagedFile.name}" against your ${activePreset?.name || 'active'} tone rubric.`
            : 'Drop a customer call recording or pick a sample below to inspect tone shifts and grounded promises.'}
        </p>

        {/* 28-Bar Centered Symmetric Acoustic Waveform */}
        <div
          ref={waveformRef}
          onClick={() => !isProcessing && !stagedFile && fileInputRef.current?.click()}
          className={`flex h-14 items-center justify-center gap-1.5 sm:gap-2 px-4 ${
            !isProcessing && !stagedFile ? 'cursor-pointer group' : ''
          }`}
          title={!stagedFile && !isProcessing ? 'Click to choose an audio file' : undefined}
        >
          {WAVEFORM_HEIGHTS.map((heightPct, idx) => (
            <span
              key={idx}
              className={`composer-wave-bar w-1 rounded-full origin-center transition-colors duration-300 ${
                isProcessing || isDragOver
                  ? 'bg-accent'
                  : stagedFile
                  ? idx % 3 === 0
                    ? 'bg-accent'
                    : 'bg-ink/75'
                  : 'bg-ink/35 group-hover:bg-accent/80'
              }`}
              style={{ height: `${heightPct}%` }}
            />
          ))}
        </div>

        {/* 4 Compact Stage Pills when Processing */}
        {isProcessing && (
          <div className="space-y-2.5">
            {progressPct > 0 && (
              <div className="h-1 w-full max-w-md mx-auto overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPct))}%` }}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
              {stages.map((label, idx) => {
                const done = activeStage > idx;
                const active = activeStage === idx;
                return (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 transition-colors ${
                      done
                        ? 'border-status-green/35 bg-status-green-soft text-status-green font-semibold'
                        : active
                        ? 'border-accent bg-accent-soft text-accent font-bold'
                        : 'border-subtle bg-canvas text-ink-muted'
                    }`}
                  >
                    {done && <Check className="h-3 w-3" />}
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Composer Dock (Staged Attachment / Sample Chips + Submit Arrow) */}
      <div className="mx-auto max-w-2xl rounded-2xl border border-subtle bg-canvas p-3 space-y-3">
        {/* Top Chip Strip: Staged File Chip OR Quick Sample Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {stagedFile ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink">
                <FileAudio className="h-3.5 w-3.5 text-accent" />
                <span className="truncate max-w-[200px] sm:max-w-[280px]">
                  {stagedFile.name}
                </span>
                <span className="font-mono text-[10px] text-ink-muted">
                  {(stagedFile.size / (1024 * 1024)).toFixed(2)} MB
                </span>
                {!isProcessing && onStageFile && (
                  <button
                    type="button"
                    onClick={() => onStageFile(null)}
                    aria-label="Remove staged file"
                    className="ml-0.5 rounded p-0.5 text-ink-muted hover:text-status-red cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>

              {onOpenConfig && !isProcessing && (
                <button
                  type="button"
                  onClick={onOpenConfig}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-accent hover:text-ink transition-colors cursor-pointer"
                >
                  <Sliders className="h-3 w-3 text-accent" />
                  {activePreset?.name || 'Rubric'}
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleLoadSample('/test_call_green.m4a', 'test_call_green.m4a', true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-status-green/50 hover:text-status-green transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-green" />
                sample-green.m4a
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleLoadSample('/test_call_red.m4a', 'test_call_red.m4a', true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-status-red/50 hover:text-status-red transition-colors cursor-pointer disabled:opacity-50"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-red" />
                sample-red.m4a
              </button>

              <select
                disabled={isProcessing}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleLoadSample(val, val.split('/').pop() || 'sample.m4a', true);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-accent hover:text-ink focus:outline-none focus:border-accent transition-colors cursor-pointer disabled:opacity-50"
              >
                <option value="" disabled>
                  More multilingual calls...
                </option>
                <option value="/test_call_multilingual.m4a">
                  Hindi / Hinglish Retail (46 Turns)
                </option>
                <option value="/test1.m4a">Hindi Order #1</option>
                <option value="/test2.m4a">Hindi Order #2</option>
                <option value="/test7.m4a">Hindi Order #7</option>
              </select>
            </>
          )}
        </div>

        {/* Bottom Dock Action Bar: Browse Audio + Hints + Right Submit Arrow */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-subtle/60">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 text-xs font-semibold text-ink hover:border-accent hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
              title="Attach audio recording (.m4a, .mp3, .wav, .ogg, .webm, .aac, .flac)"
            >
              <Paperclip className="h-3.5 w-3.5 text-accent" />
              <span>{stagedFile ? 'Replace' : 'Attach Audio'}</span>
            </button>

            <span className="hidden sm:inline text-[11px] text-ink-muted font-mono">
              .m4a / .mp3 / .wav &bull; Max 500 MB
            </span>
          </div>

          <button
            type="button"
            disabled={isProcessing}
            onClick={handlePrimarySubmit}
            aria-label={stagedFile ? 'Analyze Staged Recording' : 'Select Audio Recording'}
            title={stagedFile ? 'Run QA Audit' : 'Browse Audio File'}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
              stagedFile
                ? 'bg-accent text-accent-fg hover:bg-accent-hover shadow-xs'
                : 'bg-surface border border-subtle text-ink-muted hover:border-accent hover:text-accent'
            }`}
          >
            {stagedFile ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Analyze</span>
                <ArrowUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-auto max-w-2xl mt-3 flex items-center gap-2 rounded-xl bg-status-red-soft p-3 text-xs text-status-red border border-status-red/30 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
