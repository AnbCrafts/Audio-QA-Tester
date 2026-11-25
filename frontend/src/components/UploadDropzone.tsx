import React, { useRef, useState, useEffect } from 'react';
import {
  UploadCloud,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  Play,
  Sliders,
  RotateCcw,
  Check,
  Circle,
  Zap,
} from 'lucide-react';
import { BusinessPreset, SensitivityLevel } from '../types';

interface UploadDropzoneProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  processingStep: string;
  activePreset?: BusinessPreset;
  activeSensitivity?: SensitivityLevel;
  onOpenConfig?: () => void;
  stagedFile?: File | null;
  onStageFile?: (file: File | null) => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileUpload,
  isProcessing,
  processingStep,
  activePreset,
  activeSensitivity = 'balanced',
  onOpenConfig,
  stagedFile = null,
  onStageFile,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive active progress stage (0, 1, 2, 3) from processingStep text
  const getActiveStageIndex = () => {
    const s = processingStep.toLowerCase();
    if (s.includes('extracting') || s.includes('commitment')) return 3;
    if (s.includes('isolating') || s.includes('scoring') || s.includes('etiquette')) return 2;
    if (s.includes('transcribing') || s.includes('turns') || s.includes('diarization')) return 1;
    return 0;
  };

  const activeStage = getActiveStageIndex();

  const stages = [
    { title: 'Upload & Content Fingerprinting', desc: 'SHA-256 hashing & checking Two-Tier cache' },
    { title: 'Acoustic Diarization & Speech Decoding', desc: 'Native multimodal waveform processing' },
    { title: 'Demeanor & Etiquette Compliance Audit', desc: `Auditing against ${activePreset?.name || 'B2B Sales'} rubric` },
    { title: 'Commitment Extraction & Final Report', desc: 'Evidence quotes & non-hallucinated deadlines' },
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const validateAndStageOrProcess = (file: File, autoStart = false) => {
    setErrorMsg(null);
    const validExtensions = ['.m4a', '.mp3', '.wav', '.ogg', '.aac'];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExt) {
      setErrorMsg('Please upload a supported audio file (.m4a is prioritized).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('Audio file is larger than 25MB limit.');
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndStageOrProcess(e.dataTransfer.files[0], false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndStageOrProcess(e.target.files[0], false);
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

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm shadow-xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-amber-400" />
            Upload Sales Call Recording
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Accepts <span className="text-amber-400 font-semibold font-mono">.m4a</span> recordings to evaluate representative tone, diarize speakers, and extract commitments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activePreset && (
            <span className="text-[11px] font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              Preset: <strong className="text-amber-300">{activePreset.name}</strong> ({activeSensitivity.toUpperCase()})
            </span>
          )}
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            Max 25MB
          </span>
        </div>
      </div>

      {/* When Processing: Multi-Stage Animated Stepper */}
      {isProcessing ? (
        <div className="rounded-xl border border-amber-500/30 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 mb-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Analyzing Recording with Two-Tier AI Pipeline
                </h3>
                <p className="text-xs text-amber-400 font-mono">
                  {processingStep || 'Transcribing call with speaker diarization...'}
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400 border border-amber-500/20">
              <Zap className="h-3 w-3" /> Step {activeStage + 1} of 4
            </span>
          </div>

          {/* 4 Interactive Stages Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stages.map((stage, idx) => {
              const isDone = activeStage > idx;
              const isActive = activeStage === idx;
              const isPending = activeStage < idx;

              return (
                <div
                  key={stage.title}
                  className={`rounded-xl p-3.5 border transition-all ${
                    isDone
                      ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                      : isActive
                      ? 'border-amber-400/60 bg-amber-950/25 text-amber-200 shadow-md shadow-amber-500/10'
                      : 'border-slate-800/60 bg-slate-900/30 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-600 shrink-0" />
                    )}
                    <span className="text-xs font-bold leading-tight line-clamp-1">
                      {stage.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal pl-6">
                    {stage.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : stagedFile ? (
        /* Staged Audio File Ready State: Allows inspecting config or starting analysis */
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-5 shadow-lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <FileAudio className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{stagedFile.name}</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    ({(stagedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Audio staged and ready. You can adjust the configuration below or run analysis immediately.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
              {onOpenConfig && (
                <button
                  type="button"
                  onClick={onOpenConfig}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
                >
                  <Sliders className="h-3.5 w-3.5 text-amber-400" />
                  Configure Rubric
                </button>
              )}
              {onStageFile && (
                <button
                  type="button"
                  onClick={() => onStageFile(null)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                >
                  Change Audio
                </button>
              )}
              <button
                type="button"
                onClick={() => onFileUpload(stagedFile)}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-2 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-amber-300 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                🚀 Analyze Call Recording
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Default Drop Zone Box */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${
            isDragOver
              ? 'border-amber-400 bg-amber-500/10 scale-[1.005]'
              : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".m4a,.mp3,.wav,.ogg,.aac,audio/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="flex flex-col items-center py-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mb-3.5 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <UploadCloud className="h-8 w-8" />
            </div>
            <p className="text-base font-bold text-slate-200">
              Drop your <span className="text-amber-400 font-mono">.m4a</span> audio recording here, or{' '}
              <span className="text-amber-400 underline underline-offset-4">browse files</span>
            </p>
            <p className="text-xs text-slate-500 mt-1.5">
              Supports English, Hindi, and Hinglish dialogue • Auto speaker diarization
            </p>
          </div>
        </div>
      )}

      {/* 1-Click Quick Demo Audio Pills */}
      {!isProcessing && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Quick Demo Calls (1-Click Test):
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSample('/test_call_green.m4a', 'test_call_green.m4a', true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              GREEN Compliant Call
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSample('/test_call_red.m4a', 'test_call_red.m4a', true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              RED Hostile Violation Call
            </button>

            {/* Language / Multilingual Call Selection Dropdown */}
            <div className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleLoadSample(val, val.split('/').pop() || 'sample.m4a', true);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="appearance-none rounded-lg bg-slate-900 border border-slate-700/80 px-3 py-1.5 pr-8 text-xs font-semibold text-amber-300 hover:text-white hover:border-amber-500/40 focus:outline-none focus:border-amber-400 transition-all cursor-pointer shadow-sm"
              >
                <option value="" disabled className="bg-slate-900 text-slate-400">
                  Select Language / Call...
                </option>
                <option value="/test_call_multilingual.m4a" className="bg-slate-900 text-white">
                  Hindi / Hinglish Retail Order (46 Turns)
                </option>
                <option value="/test1.m4a" className="bg-slate-900 text-white">
                  Hindi Order Recording #1
                </option>
                <option value="/test2.m4a" className="bg-slate-900 text-white">
                  Hindi Order Recording #2
                </option>
                <option value="/test7.m4a" className="bg-slate-900 text-white">
                  Hindi Order Recording #7
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-amber-400/80" />
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
