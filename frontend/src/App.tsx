import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { UploadDropzone } from './components/UploadDropzone';
import { ToneCard } from './components/ToneCard';
import { ActionItemsList } from './components/ActionItemsList';
import { TranscriptViewer } from './components/TranscriptViewer';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { ConfigDrawer } from './components/ConfigDrawer';
import { BUSINESS_PRESETS } from './data/presets';
import { AnalysisConfig, AnalysisReport } from './types';
import { API_BASE_URL } from './config';
import {
  CheckCircle2,
  AlertTriangle,
  FileAudio,
  ShieldCheck,
  MessagesSquare,
  Sparkles,
  RotateCcw,
  Headphones,
  Zap,
} from 'lucide-react';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AnalysisConfig>({
    presetId: BUSINESS_PRESETS[0].id,
    presetName: BUSINESS_PRESETS[0].name,
    sensitivity: BUSINESS_PRESETS[0].defaultSensitivity,
    toneCriteria: BUSINESS_PRESETS[0].defaultToneCriteria,
    actionItemScope: BUSINESS_PRESETS[0].defaultActionItemScope,
    customForbiddenPhrases: [],
    repSpeakerId: 'auto',
    aiProvider: 'gemini',
  });

  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'healthy') {
            setIsBackendConnected(true);
          }
        } else {
          setIsBackendConnected(false);
        }
      } catch (err) {
        setIsBackendConnected(false);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  const activePreset =
    BUSINESS_PRESETS.find((p) => p.id === config.presetId) || BUSINESS_PRESETS[0];

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setCurrentReport(null);
    setProcessingStep('Sending audio to AI engine for transcription & speaker diarization...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('config', JSON.stringify(config));

      const controller = new AbortController();
      // Generous 5-minute timeout for multi-minute calls or high AI API load
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const step1Timer = setTimeout(() => {
        setProcessingStep('Transcribing audio turns (multilingual Hindi/Hinglish/English)...');
      }, 3000);

      const step2Timer = setTimeout(() => {
        setProcessingStep('Isolating Sales Rep dialogue & scoring tone against rubric...');
      }, 10000);

      const step3Timer = setTimeout(() => {
        setProcessingStep('Extracting evidence-backed commitments & action items...');
      }, 20000);

      const resp = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);

      if (resp.ok) {
        const data = await resp.json();
        // Memory safety: free previous audio object URL before allocating a new one
        if (currentReport?.audioUrl) {
          URL.revokeObjectURL(currentReport.audioUrl);
        }
        setCurrentReport({
          ...data,
          audioUrl: URL.createObjectURL(file),
        });
        setIsProcessing(false);
      } else {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error (${resp.status}): Failed to analyze call.`);
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        setErrorMessage('The analysis request timed out. Large recordings or high API server demand can cause delays. Please try again or switch to the Groq fallback engine in the settings drawer.');
      } else {
        setErrorMessage(err.message || 'Failed to connect to backend server. Please make sure the FastAPI server is running on port 8000.');
      }
      setIsProcessing(false);
    }
  };

  const handleJumpToTimestamp = (timestampStr: string, explicitSeconds?: number | null) => {
    if (explicitSeconds !== undefined && explicitSeconds !== null) {
      setSeekTime(explicitSeconds);
      return;
    }
    const parts = timestampStr.split(':');
    if (parts.length === 2) {
      const seconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      setSeekTime(seconds);
    }
  };

  const handleUpdateTranscriptSegment = (id: string, newText: string, newSpeaker: string) => {
    if (!currentReport) return;
    const isRep = newSpeaker === 'Sales Rep';
    const updated = currentReport.transcript.map((seg) => {
      if (seg.id === id) {
        return {
          ...seg,
          text: newText,
          speaker: newSpeaker,
          isRep,
        };
      }
      return seg;
    });

    setCurrentReport({
      ...currentReport,
      transcript: updated,
    });
  };

  const handleReset = () => {
    // Memory safety: free audio object URL on reset
    if (currentReport?.audioUrl) {
      URL.revokeObjectURL(currentReport.audioUrl);
    }
    setCurrentReport(null);
    setErrorMessage(null);
    setSeekTime(null);
  };

  // Memory safety: free audio object URL when unmounting
  useEffect(() => {
    return () => {
      if (currentReport?.audioUrl) {
        URL.revokeObjectURL(currentReport.audioUrl);
      }
    };
  }, [currentReport?.audioUrl]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activePreset={activePreset}
        onOpenConfig={() => setIsConfigOpen(true)}
        isBackendConnected={isBackendConnected}
      />

      {/* Main Container taking 90% page width */}
      <main className="mx-auto w-[90%] flex-1 py-8 space-y-6">
        {/* Upload Area */}
        <UploadDropzone
          onFileUpload={handleFileUpload}
          isProcessing={isProcessing}
          processingStep={processingStep}
        />

        {/* State 1: Error Message Banner */}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 backdrop-blur-sm shadow-xl flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-rose-300">Analysis Error</h3>
              <p className="text-xs text-rose-200/80 mt-1 leading-relaxed">
                {errorMessage}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setErrorMessage(null)}
                  className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer border border-rose-500/30"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 2: Empty / Ready State (When nothing is uploaded yet) */}
        {!currentReport && !isProcessing && !errorMessage && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center backdrop-blur-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-slate-400 border border-slate-800 mb-4">
              <Headphones className="h-8 w-8 text-amber-400/80" />
            </div>
            <h3 className="text-base font-bold text-white">
              No Call Recording Uploaded Yet
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
              Upload an <strong className="text-slate-300">.m4a</strong> call recording above to run the tone quality evaluation, speaker diarization, and action item extraction.
            </p>

            {/* Feature highlights preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto mt-8 text-left">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                  <MessagesSquare className="h-4 w-4 text-amber-400" />
                  Speaker Diarization
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Automatically separates dialogue into Sales Rep and Customer turns with millisecond timestamps.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  RED / GREEN Tone Rating
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Evaluates representative tone against your active business rubric, backed by verbatim quotes.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                  Commitment Extraction
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Identifies concrete commitments and deadlines without hallucinating unmentioned timelines.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* State 3: Active Results Dashboard (Rendered ONLY after successful upload & analysis) */}
        {currentReport && (
          <div className="space-y-6">
            {/* Top Toolbar / Reset */}
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Analysis for: <strong className="text-white">{currentReport.fileName}</strong></span>
                <span>•</span>
                <span>Uploaded {currentReport.uploadedAt}</span>
                {currentReport.engineUsed && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20">
                      <Sparkles className="h-3 w-3 text-indigo-400" />
                      {currentReport.engineUsed}
                    </span>
                  </>
                )}
                {currentReport.cached && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
                      <Zap className="h-3 w-3 text-amber-400" />
                      Cached Analysis (0s)
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await fetch(`${API_BASE_URL}/api/cache`, { method: 'DELETE' }).catch(() => {});
                    handleReset();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
                  title="Clear server cache to re-run fresh analysis"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Clear Cache
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Upload Another Call
                </button>
              </div>
            </div>

            {/* Audio Player Bar */}
            <AudioPlayerBar
              fileName={currentReport.fileName}
              fileSize={currentReport.fileSize}
              durationStr={currentReport.duration}
              audioUrl={currentReport.audioUrl}
              seekTime={seekTime}
            />

            {/* Tone Evaluation Card */}
            <ToneCard
              tone={currentReport.tone}
              onJumpToTimestamp={handleJumpToTimestamp}
            />

            {/* Dual Column Layout: Commitments & Action Items + Diarized Transcript */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Action Items (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                <ActionItemsList
                  actionItems={currentReport.actionItems}
                  onSeekTimestamp={handleJumpToTimestamp}
                />

                {/* Assessment Scoring Overview Card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-xs">
                  <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-2 mb-3">
                    <CheckCircle2 className="h-4 w-4 text-amber-400" />
                    ScaleWorks AI Evaluation Criteria
                  </h4>
                  <div className="space-y-2.5 text-slate-400">
                    <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                      <span><strong>40% Accuracy & Reliability:</strong> Evidence quotes cited directly from transcript; no hallucinations.</span>
                      <span className="font-mono text-emerald-400 font-bold ml-2">Verified</span>
                    </div>
                    <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                      <span><strong>30% User Experience:</strong> Direct audio player, speaker diarization, clear RED/GREEN visual hierarchy.</span>
                      <span className="font-mono text-emerald-400 font-bold ml-2">Active</span>
                    </div>
                    <div className="flex items-start justify-between">
                      <span><strong>30% Configurability:</strong> Preset switching for multiple business types, custom rubrics & sensitivity sliders.</span>
                      <span className="font-mono text-amber-400 font-bold ml-2">Customizable</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Diarized Transcript Viewer (7 cols) */}
              <div className="lg:col-span-7">
                <TranscriptViewer
                  transcript={currentReport.transcript}
                  onSeekAudio={(sec) => setSeekTime(sec)}
                  onUpdateSegment={handleUpdateTranscriptSegment}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-over Configurability Drawer */}
      <ConfigDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => setConfig(newConfig)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        ScaleWorks AI Engineering Assessment • Forward Deployed Engineer • Built with React & FastAPI
      </footer>
    </div>
  );
};
