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

  // Parse durationStr (e.g. "01:54") to seconds as fallback
  const parseDurationStringToSeconds = (str: string): number => {
    const parts = str.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseInt(parts[1], 10) || 0;
      return minutes * 60 + seconds;
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
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveMaxDuration =
    totalDuration > 0
      ? totalDuration
      : parseDurationStringToSeconds(durationStr);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md">
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Music className="h-5 w-5" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md">
                {fileName}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-amber-400 border border-slate-700">
                .M4A
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Size: {fileSize} • Duration: {durationStr}
            </div>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="flex flex-1 max-w-xl flex-col gap-1.5 px-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={effectiveMaxDuration}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400"
            />
            <span className="text-[11px] font-mono text-slate-500 w-10">
              {formatSeconds(effectiveMaxDuration)}
            </span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={() => handleSkipSeconds(-5)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            title="Rewind 5s"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            onClick={handleTogglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => handleSkipSeconds(5)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            title="Fast forward 5s"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            onClick={handleCyclePlaybackRate}
            className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-mono font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Playback Speed"
          >
            {playbackRate}x
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
