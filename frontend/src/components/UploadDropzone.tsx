import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';

interface UploadDropzoneProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  processingStep: string;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileUpload,
  isProcessing,
  processingStep,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const validateAndProcess = (file: File) => {
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

    onFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(e.target.files[0]);
    }
  };

  const handleLoadSample = async (url: string, filename: string) => {
    try {
      setErrorMsg(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not fetch sample audio');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'audio/mp4' });
      onFileUpload(file);
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
        <div className="text-[11px] text-slate-500 font-mono">
          Container: .m4a • Max Size: 25MB
        </div>
      </div>

      {/* Drop Zone Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-amber-400 bg-amber-500/10 scale-[1.005]'
            : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/70'
        } ${isProcessing ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.mp3,.wav,.ogg,.aac,audio/*"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="h-12 w-12 text-amber-400 animate-spin mb-4" />
            <h3 className="text-base font-bold text-white mb-1.5">
              Analyzing Recording with Dual AI Engines
            </h3>
            <p className="text-xs text-amber-400 font-mono animate-pulse max-w-md">
              {processingStep || 'Transcribing call with speaker diarization...'}
            </p>
            <div className="mt-5 flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Grounded Evidence Citations
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Isolated Rep Tone Check
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4">
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
        )}
      </div>

      {/* 1-Click Quick Demo Audio Pills */}
      {!isProcessing && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Quick Demo Calls (1-Click Test):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSample('/test_call_green.m4a', 'test_call_green.m4a');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              🟢 GREEN Compliant Call
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSample('/test_call_red.m4a', 'test_call_red.m4a');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
              🔴 RED Hostile Violation Call
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLoadSample('/test_call_multilingual.m4a', 'test_call_multilingual.m4a');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              🌐 Hindi/Hinglish Retail Order (46 Turns)
            </button>
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
