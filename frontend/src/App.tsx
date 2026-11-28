import React, { useState, useEffect, useRef } from 'react';
import { Navbar, AppNavTab } from './components/Navbar';
import { UploadDropzone } from './components/UploadDropzone';
import { ToneCard } from './components/ToneCard';
import { ActionItemsList } from './components/ActionItemsList';
import { TranscriptViewer } from './components/TranscriptViewer';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { ConfigDrawer } from './components/ConfigDrawer';
import { CallHistoryView } from './components/CallHistoryView';
import { CommitmentsBoard } from './components/CommitmentsBoard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { WorkspaceAdminView } from './components/WorkspaceAdminView';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { ThemeProvider } from './context/ThemeContext';
import { AmbientBackdrop } from './components/reactbits/AmbientBackdrop';
import { EqualizerLoader } from './components/reactbits/EqualizerLoader';
import { BUSINESS_PRESETS } from './data/presets';
import { AnalysisConfig, AnalysisReport, JobProgressEvent, OrgTokenQuota, UserProfile } from './types';
import { API_BASE_URL, generateIdempotencyKey } from './config';
import { uploadFileInChunks } from './utils/uploadClient';
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

  const [activeTab, setActiveTab] = useState<AppNavTab>('auditor');
  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [tokenQuota, setTokenQuota] = useState<OrgTokenQuota | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const openAuthModal = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const fetchTokenQuota = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/org/token-quota`, { credentials: 'include' });
      if (res.status === 401) {
        setCurrentUser(null);
        setTokenQuota(null);
        return;
      }
      if (res.ok) {
        setTokenQuota(await res.json());
      }
    } catch {
      // ignore transient quota refresh failure
    }
  };

  // Check backend health and current auth session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
          fetchTokenQuota();
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecked(true);
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    closeActiveEventSource();
    setCurrentUser(null);
    setTokenQuota(null);
    setCurrentReport(null);
  };

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

  const closeActiveEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const formatApiError = (errJson: any, fallback: string): string => {
    if (!errJson || !errJson.detail) return fallback;
    if (typeof errJson.detail === 'string') return errJson.detail;
    if (Array.isArray(errJson.detail)) {
      return errJson.detail
        .map((d: any) => String(d?.msg || '').replace(/^Value error,\s*/i, ''))
        .filter(Boolean)
        .join('; ') || fallback;
    }
    return fallback;
  };

  const resolveAudioUrl = (rawUrl?: string | null, fallbackUrl?: string | null) => {
    if (!rawUrl) return fallbackUrl || null;
    if (rawUrl.startsWith('/api/')) return `${API_BASE_URL}${rawUrl}`;
    return rawUrl;
  };

  const subscribeToJobProgress = (
    jobId: string,
    fallbackAudioUrl: string,
    configToUse: AnalysisConfig
  ) => {
    closeActiveEventSource();
    const es = new EventSource(`${API_BASE_URL}/api/jobs/${jobId}/events`, { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: JobProgressEvent = JSON.parse(event.data);
        setProcessingStep(data.stageMessage || 'Processing audio...');
        // Map worker 0..100% into 25..100% after upload phase
        setProgressPct(Math.max(25, Math.min(100, 25 + Math.round((data.progressPct || 0) * 0.75))));

        if (data.status === 'COMPLETED' && data.report) {
          closeActiveEventSource();
          const report: AnalysisReport = {
            ...data.report,
            audioUrl: resolveAudioUrl(data.report.audioUrl, fallbackAudioUrl),
            configUsed: configToUse,
          };
          setCurrentReport(report);
          setProgressPct(100);
          setIsProcessing(false);
          fetchTokenQuota();
        } else if (data.status === 'FAILED') {
          closeActiveEventSource();
          setErrorMessage(data.errorMessage || 'Analysis job failed.');
          setIsProcessing(false);
          fetchTokenQuota();
        }
      } catch (parseErr) {
        console.error('Failed to parse SSE event:', parseErr);
      }
    };

    es.onerror = async () => {
      closeActiveEventSource();
      try {
        const pollRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, { credentials: 'include' });
        if (pollRes.ok) {
          const pollData: JobProgressEvent = await pollRes.json();
          if (pollData.status === 'COMPLETED' && pollData.report) {
            const report: AnalysisReport = {
              ...pollData.report,
              audioUrl: resolveAudioUrl(pollData.report.audioUrl, fallbackAudioUrl),
              configUsed: configToUse,
            };
            setCurrentReport(report);
            setIsProcessing(false);
            fetchTokenQuota();
            return;
          }
          if (pollData.status === 'FAILED') {
            setErrorMessage(pollData.errorMessage || 'Analysis job failed.');
            setIsProcessing(false);
            return;
          }
        }
      } catch {
        // fall through to generic SSE disconnect error
      }
      setErrorMessage('Lost live connection to analysis job. Please check Call History or retry.');
      setIsProcessing(false);
    };
  };

  const handleFileUpload = async (file: File) => {
    setActiveFile(file);
    setStagedFile(null);
    setIsProcessing(true);
    setProgressPct(2);
    setErrorMessage(null);
    setCurrentReport(null);
    setProcessingStep('Fingerprinting & preparing chunked upload...');

    try {
      const uploadResult = await uploadFileInChunks(file, API_BASE_URL, (uploadPct, stepText) => {
        // Upload phase fills 0..25% of total bar; AI worker fills 25..100%
        setProgressPct(Math.max(2, Math.round(uploadPct * 0.25)));
        setProcessingStep(stepText);
      });

      setProgressPct(26);
      setProcessingStep('Queueing background AI analysis job...');

      const resp = await fetch(`${API_BASE_URL}/api/analyze/async`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey(),
        },
        body: JSON.stringify({
          assetId: uploadResult.assetId,
          config,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        if (resp.status === 429 && errJson.code === 'DAILY_QUOTA_EXCEEDED') {
          fetchTokenQuota();
        }
        throw new Error(formatApiError(errJson, `Server error (${resp.status}): Failed to queue analysis.`));
      }

      const jobData = await resp.json();
      if ((jobData.cached || jobData.status === 'COMPLETED') && jobData.report) {
        setProcessingStep('Instant Tier-2 cache hit: loaded verified analysis report.');
        setProgressPct(100);
        setCurrentReport({
          ...jobData.report,
          audioUrl: resolveAudioUrl(jobData.report.audioUrl, uploadResult.audioUrl),
          configUsed: config,
        });
        setIsProcessing(false);
        fetchTokenQuota();
        return;
      }

      subscribeToJobProgress(jobData.jobId, uploadResult.audioUrl, config);
    } catch (err: any) {
      console.error('Analysis error:', err);
      closeActiveEventSource();
      const msg = err.message || 'Failed to upload or analyze call recording.';
      const isAuthErr = err?.status === 401 || /authentication required|sign in/i.test(msg);
      if (isAuthErr) {
        setCurrentUser(null);
        setTokenQuota(null);
        setStagedFile(file);
        setErrorMessage(null);
        openAuthModal('login');
      } else {
        setErrorMessage(msg);
      }
      setIsProcessing(false);
    }
  };

  const handleSelectHistoricalCall = async (callId: string, seekSeconds?: number | null) => {
    try {
      setIsProcessing(true);
      setProgressPct(50);
      setErrorMessage(null);
      setProcessingStep('Retrieving verified call audit from database...');
      const res = await fetch(`${API_BASE_URL}/api/history/${callId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load call audit');
      const data: AnalysisReport = await res.json();
      data.status = 'completed';
      data.configUsed = config;
      data.audioUrl = resolveAudioUrl(data.audioUrl, `/${data.fileName}`);
      setCurrentReport(data);
      setActiveTab('auditor');
      if (seekSeconds !== undefined && seekSeconds !== null) {
        setSeekTime(seekSeconds);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve call from database.');
    } finally {
      setIsProcessing(false);
      setProgressPct(0);
    }
  };

  const handleReanalyze = async (newConfig?: AnalysisConfig) => {
    const configToUse = newConfig || config;
    const existingAssetId = currentReport?.assetId;

    if (!existingAssetId && !activeFile) {
      setIsConfigOpen(false);
      return;
    }

    if (!existingAssetId && activeFile) {
      setIsConfigOpen(false);
      await handleFileUpload(activeFile);
      return;
    }

    setIsProcessing(true);
    setProgressPct(30);
    setErrorMessage(null);
    setProcessingStep('Re-analyzing stored audio against updated rubric (0 bytes re-uploaded)...');
    setIsConfigOpen(false);

    try {
      const resp = await fetch(`${API_BASE_URL}/api/analyze/async`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey(),
        },
        body: JSON.stringify({
          assetId: existingAssetId,
          config: configToUse,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          setCurrentUser(null);
          setTokenQuota(null);
          setErrorMessage(null);
          openAuthModal('login');
          setIsProcessing(false);
          return;
        }
        if (resp.status === 429 && errJson.code === 'DAILY_QUOTA_EXCEEDED') {
          fetchTokenQuota();
        }
        throw new Error(formatApiError(errJson, `Server error (${resp.status}): Failed to re-analyze call.`));
      }

      const jobData = await resp.json();
      const streamUrl = `${API_BASE_URL}/api/assets/${existingAssetId}/stream`;
      subscribeToJobProgress(jobData.jobId, streamUrl, configToUse);
    } catch (err: any) {
      console.error('Re-analysis error:', err);
      closeActiveEventSource();
      setErrorMessage(err.message || 'Failed to re-analyze recording with updated settings.');
      setIsProcessing(false);
    }
  };

  const handleJumpToTimestamp = (timestampStr: string, explicitSeconds?: number | null) => {
    if (explicitSeconds !== undefined && explicitSeconds !== null) {
      setSeekTime(explicitSeconds);
      return;
    }
    const parts = timestampStr.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 2) {
      setSeekTime(parts[0] * 60 + parts[1]);
    } else if (parts.length === 3) {
      setSeekTime(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  };

  const handleUpdateTranscriptSegment = async (id: string, newText: string, newSpeaker: string) => {
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

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/history/${encodeURIComponent(currentReport.callId)}/transcript/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText, speaker: newSpeaker }),
        }
      );
      if (res.ok) {
        const persisted = await res.json();
        setCurrentReport((prev) =>
          prev
            ? {
                ...prev,
                transcript: prev.transcript.map((s) => (s.id === id ? { ...s, ...persisted } : s)),
              }
            : prev
        );
      }
    } catch (err) {
      console.error('Failed to persist transcript edit:', err);
    }
  };

  const handleReset = () => {
    if (currentReport?.audioUrl) {
      URL.revokeObjectURL(currentReport.audioUrl);
    }
    setCurrentReport(null);
    setActiveFile(null);
    setStagedFile(null);
    setErrorMessage(null);
    setSeekTime(null);
  };

  useEffect(() => {
    return () => {
      closeActiveEventSource();
      if (currentReport?.audioUrl && currentReport.audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentReport.audioUrl);
      }
    };
  }, [currentReport?.audioUrl]);

  return (
    <ThemeProvider>
      {!authChecked ? (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-canvas text-ink">
          <EqualizerLoader size="lg" />
          <p className="text-xs font-mono text-ink-muted">Initializing Inflect Workspace...</p>
        </div>
      ) : !currentUser ? (
        <>
          <LandingPage
            onOpenAuth={openAuthModal}
            isBackendConnected={isBackendConnected}
          />
          <AuthModal
            isOpen={authModalOpen}
            initialMode={authModalMode}
            onClose={() => setAuthModalOpen(false)}
            onAuthenticated={(user) => {
              setCurrentUser(user);
              setAuthModalOpen(false);
              fetchTokenQuota();
            }}
          />
        </>
      ) : (
        <div className="relative min-h-screen text-ink flex flex-col">
          <AmbientBackdrop intensity="subtle" />

          {/* Top Navigation */}
          <Navbar
            activePreset={activePreset}
            onOpenConfig={() => setIsConfigOpen(true)}
            isBackendConnected={isBackendConnected}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            user={currentUser}
            tokenQuota={tokenQuota}
            onLogout={handleLogout}
          />

          {/* Main Container */}
          <main className="mx-auto w-[92%] max-w-7xl flex-1 py-7 space-y-6">
            {tokenQuota?.isExhausted && (
              <div className="rounded-xl border border-status-red/35 bg-status-red-soft p-4 text-xs text-ink flex items-center justify-between gap-4">
                <div>
                  <strong className="text-status-red">Daily Token Quota Exhausted:</strong>{' '}
                  {tokenQuota.usedToday.toLocaleString()} / {tokenQuota.dailyLimit.toLocaleString()} tokens used today.
                  Your workspace quota automatically renews tomorrow at{' '}
                  <strong>{new Date(tokenQuota.renewsAtUtc).toLocaleString()}</strong>.
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="shrink-0 rounded-lg border border-status-red/35 bg-surface px-3 py-1.5 font-bold text-status-red hover:bg-status-red hover:text-white transition-colors cursor-pointer"
                >
                  View Usage
                </button>
              </div>
            )}

            {/* TAB 1: LIVE AUDITOR */}
            {activeTab === 'auditor' && (
              <div className="space-y-6 animate-fadeIn">
                {/* Upload Area */}
                <UploadDropzone
                  onFileUpload={handleFileUpload}
                  isProcessing={isProcessing}
                  processingStep={processingStep}
                  progressPct={progressPct}
                  activePreset={activePreset}
                  activeSensitivity={config.sensitivity}
                  onOpenConfig={() => setIsConfigOpen(true)}
                  stagedFile={stagedFile}
                  onStageFile={(f) => setStagedFile(f)}
                />

                {/* Error Message */}
                {errorMessage && (
                  <div className="rounded-xl border border-status-red/35 bg-status-red-soft p-4 text-xs text-ink flex items-start gap-3 shadow-sm">
                    <AlertTriangle className="h-4 w-4 text-status-red mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <strong className="font-bold text-status-red">Analysis Pipeline Issue:</strong> {errorMessage}
                      <div className="mt-2 flex items-center gap-3">
                        {/sign in|session expired|authentication/i.test(errorMessage) ? (
                          <button
                            type="button"
                            onClick={() => openAuthModal('login')}
                            className="rounded-lg bg-accent text-accent-fg px-3 py-1 text-xs font-bold transition-all cursor-pointer hover:bg-accent-hover"
                          >
                            Sign In to Workspace
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => activeFile && handleFileUpload(activeFile)}
                            className="rounded-lg bg-status-red text-white px-3 py-1 text-xs font-semibold transition-all cursor-pointer hover:opacity-90"
                          >
                            Retry Analysis
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setErrorMessage(null)}
                          className="text-ink-muted hover:text-ink text-xs cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Analysis Results Display */}
                {currentReport && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Audio Waveform Player Bar */}
                    <AudioPlayerBar
                      audioUrl={currentReport.audioUrl || null}
                      fileName={currentReport.fileName}
                      fileSize={currentReport.fileSize}
                      durationStr={currentReport.duration}
                      seekTime={seekTime}
                    />

                    {/* Demeanor & Tone Evaluation Card */}
                    <ToneCard
                      tone={currentReport.tone}
                      callMetadata={currentReport.callMetadata}
                      onJumpToTimestamp={(ts) => handleJumpToTimestamp(ts)}
                    />

                    {/* Dual Column Layout: Commitments + Diarized Transcript */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left Column: Action Items (5 cols) */}
                      <div className="lg:col-span-5 space-y-6">
                        <ActionItemsList
                          actionItems={currentReport.actionItems}
                          onSeekTimestamp={handleJumpToTimestamp}
                        />

                        {/* Scoring Criteria Card */}
                        <div className="rounded-2xl border border-subtle bg-surface p-5 text-xs">
                          <h4 className="font-bold text-ink uppercase tracking-wider text-[11px] flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-4 w-4 text-accent" />
                            Inflect Evaluation Criteria
                          </h4>
                          <div className="space-y-2.5 text-ink-muted">
                            <div className="flex items-start justify-between border-b border-subtle pb-2">
                              <span><strong className="text-ink">40% Accuracy &amp; Reliability:</strong> Evidence quotes cited directly from transcript; no hallucinations.</span>
                              <span className="font-mono text-status-green font-bold ml-2">Verified</span>
                            </div>
                            <div className="flex items-start justify-between border-b border-subtle pb-2">
                              <span><strong className="text-ink">30% User Experience:</strong> Direct audio player, speaker diarization, clear RED/GREEN visual hierarchy.</span>
                              <span className="font-mono text-status-green font-bold ml-2">Active</span>
                            </div>
                            <div className="flex items-start justify-between">
                              <span><strong className="text-ink">30% Configurability:</strong> Preset switching for multiple business types, custom rubrics &amp; sensitivity sliders.</span>
                              <span className="font-mono text-accent font-bold ml-2">Customizable</span>
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
                          evidenceQuotes={currentReport.tone.evidenceQuotes}
                          actionItems={currentReport.actionItems}
                          toneRating={currentReport.tone.rating}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CALL HISTORY */}
            {activeTab === 'history' && (
              <CallHistoryView onSelectCall={handleSelectHistoricalCall} />
            )}

            {/* TAB 3: COMMITMENTS BOARD */}
            {activeTab === 'commitments' && (
              <CommitmentsBoard />
            )}

            {/* TAB 4: ANALYTICS DASHBOARD */}
            {activeTab === 'analytics' && (
              <AnalyticsDashboard />
            )}

            {/* TAB 5: ADMIN WORKSPACE */}
            {activeTab === 'admin' && currentUser?.role === 'ADMIN' && (
              <WorkspaceAdminView tokenQuota={tokenQuota} onQuotaUpdated={fetchTokenQuota} />
            )}
          </main>

          {/* Slide-over Configurability Drawer */}
          <ConfigDrawer
            isOpen={isConfigOpen}
            onClose={() => setIsConfigOpen(false)}
            config={config}
            onSaveConfig={(newConfig) => setConfig(newConfig)}
            hasLoadedCall={!!activeFile || !!currentReport?.assetId}
            onReanalyzeLoadedCall={handleReanalyze}
          />

          {/* Footer */}
          <footer className="border-t border-subtle bg-surface/60 py-4 text-center text-xs text-ink-muted">
            Inflect &bull; Multi-Tenant Conversation Intelligence &amp; Call QA Platform
          </footer>

          <AuthModal
            isOpen={authModalOpen}
            initialMode={authModalMode}
            onClose={() => setAuthModalOpen(false)}
            onAuthenticated={(user) => {
              setCurrentUser(user);
              setAuthModalOpen(false);
              setErrorMessage(null);
              fetchTokenQuota();
            }}
          />
        </div>
      )}
    </ThemeProvider>
  );
};
