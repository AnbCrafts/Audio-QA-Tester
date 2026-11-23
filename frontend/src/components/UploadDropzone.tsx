import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, CheckCircle2, AlertCircle, Sparkles, Loader2, Play } from 'lucide-react';

interface UploadDropzoneProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
  processingStep: string;
  onLoadGreenDemo: () => void;
  onLoadRedDemo: () => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileUpload,
  isProcessing,
  processingStep,
  onLoadGreenDemo,
  onLoadRedDemo,
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

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-amber-400" />
            Upload Sales Call Recording
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluates sales representative tone, diarizes speakers, and extracts commitments without hallucinations.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Assignment Test Audio:</span>
          <button
            type="button"
            onClick={onLoadGreenDemo}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all cursor-pointer"
          >
            <Play className="h-3 w-3" />
            Load GREEN Call (.m4a)
          </button>
          <button
            type="button"
            onClick={onLoadRedDemo}
            className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 font-semibold text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all cursor-pointer"
          >
            <Play className="h-3 w-3" />
            Load RED Call (.m4a)
          </button>
        </div>
      </div>

      {/* Drop Zone Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
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
          <div className="flex flex-col items-center py-4">
            <Loader2 className="h-10 w-10 text-amber-400 animate-spin mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">
              Analyzing Recording with Dual-Engine Verification
            </h3>
            <p className="text-xs text-amber-400/90 font-mono animate-pulse">
              {processingStep || 'Transcribing call with speaker diarization...'}
            </p>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Grounded Evidence Citations
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Isolated Rep Judgment
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mb-3 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <UploadCloud className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-200">
              Drop your <span className="text-amber-400 font-mono font-bold">.m4a</span> audio file here, or{' '}
              <span className="text-amber-400 underline underline-offset-2">browse files</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supported format: <strong className="text-slate-400">.m4a</strong> (AAC/ALAC audio) • Max file size: 25MB
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
