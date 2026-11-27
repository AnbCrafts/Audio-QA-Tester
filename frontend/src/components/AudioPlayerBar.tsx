import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Music,
} from 'lucide-react';

interface AudioPlayerBarProps {
  fileName: string;
  fileSize: string;
  durationStr: string;
  audioUrl?: string | null;
  seekTime?: number | null;
  onTimeUpdate?: (seconds: number) => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  fileName,
  fileSize,
  durationStr,
  audioUrl,
  seekTime,
  onTimeUpdate,
}) => {
  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Parse durationStr (e.g. "01:54" or "01:05:12") to seconds as fallback
  const parseDurationStringToSeconds = (str: string): number => {
    const parts = str.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 120;
  };

  // Sync seekTime prop with internal player
  useEffect(() => {
    if (seekTime !== null && seekTime !== undefined && audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
      if (!isPlaying) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    }
  }, [seekTime]);

  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      setCurrentTime(current);
      if (onTimeUpdate) {
        onTimeUpdate(current);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration) {
      setTotalDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSeconds = parseFloat(e.target.value);
    setCurrentTime(targetSeconds);
    if (audioRef.current) {
      audioRef.current.currentTime = targetSeconds;
    }
  };

  const handleSkipSeconds = (delta: number) => {
    if (!audioRef.current) return;
    const max = totalDuration || parseDurationStringToSeconds(durationStr);
    const target = Math.max(0, Math.min(max, currentTime + delta));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleCyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatSeconds = (sec: number): string => {
    const safe = Math.max(0, Math.floor(sec));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveMaxDuration =
    totalDuration > 0
      ? totalDuration
      : parseDurationStringToSeconds(durationStr);

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 shadow-sm transition-colors">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          muted={isMuted}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Track Metadata */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/30">
            <Music className="h-5 w-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink truncate max-w-xs sm:max-w-md">
                {fileName}
              </span>
              <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-mono font-bold text-accent border border-subtle">
                AUDIO
              </span>
            </div>
            <div className="text-[11px] text-ink-muted">
              Size: {fileSize} &bull; Duration: {durationStr}
            </div>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="flex flex-1 max-w-xl flex-col gap-1.5 px-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-ink-muted w-12 text-right">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={effectiveMaxDuration}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              style={{ accentColor: 'var(--accent-primary)' }}
              className="h-1.5 w-full cursor-pointer rounded-lg bg-subtle"
            />
            <span className="text-[11px] font-mono text-ink-muted w-12">
              {formatSeconds(effectiveMaxDuration)}
            </span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSkipSeconds(-5)}
            className="rounded-lg p-2 text-ink-muted hover:bg-accent-soft hover:text-ink transition-colors cursor-pointer"
            title="Rewind 5s"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg font-bold hover:bg-accent-hover transition-all shadow-sm cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSkipSeconds(5)}
            className="rounded-lg p-2 text-ink-muted hover:bg-accent-soft hover:text-ink transition-colors cursor-pointer"
            title="Fast forward 5s"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleCyclePlaybackRate}
            className="rounded-lg bg-canvas border border-subtle px-2 py-1 text-[11px] font-mono font-bold text-ink hover:border-accent transition-colors cursor-pointer"
            title="Playback Speed"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="rounded-lg p-2 text-ink-muted hover:bg-accent-soft hover:text-ink transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-status-red" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
