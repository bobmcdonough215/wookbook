import { useCallback, useEffect, useRef, useState } from "react";
import { Track } from "@/types/recording";

export function useRecordingPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);

    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
    };
  }, []);

  const play = useCallback((track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack?.src === track.src) {
      audio.play();
      return;
    }
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

  return { currentTrack, isPlaying, progress, duration, play, pause, toggle, seek, dismiss };
}
