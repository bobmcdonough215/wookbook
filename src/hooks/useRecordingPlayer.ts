import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "@/types/recording";

export function useRecordingPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onError = () => {
      setIsPlaying(false);
      setAudioError("This recording couldn't be played — the audio file may be unavailable.");
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const play = useCallback((track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack?.src === track.src) {
      audio.play();
      return;
    }
    setAudioError(null);
    audio.src = track.src;
    audio.play();
    setCurrentTrack(track);
    setProgress(0);
  }, [currentTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(
    (track: Track) => {
      if (currentTrack?.src === track.src && isPlaying) {
        pause();
      } else {
        play(track);
      }
    },
    [currentTrack, isPlaying, play, pause]
  );

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const dismiss = useCallback(() => {
    audioRef.current?.pause();
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
  }, []);

  return { currentTrack, isPlaying, progress, duration, audioError, play, pause, toggle, seek, dismiss };
}
