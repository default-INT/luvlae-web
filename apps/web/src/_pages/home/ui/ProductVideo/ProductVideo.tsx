'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';

interface Props {
  copy: { label: string; play: string; pause: string; mute: string; unmute: string; fallback: string };
}

export const ProductVideo = (props: Props) => {
  const { copy } = props;
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const visible = useRef(false);
  const reducedMotion = useRef(true);
  const manualPlay = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;

    if (!section || !video) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = motion.matches;

    const syncPlayback = () => {
      const motionAllowed = !reducedMotion.current || manualPlay.current;
      const canPlay = visible.current && !document.hidden && !userPaused.current && motionAllowed;

      if (canPlay) {
        void video.play().catch(() => setPlaying(false));
        return;
      }

      video.pause();
    };

    const onMotionChange = () => {
      reducedMotion.current = motion.matches;
      syncPlayback();
    };

    const loadObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;

      setReady(true);
      loadObserver.disconnect();
    }, { rootMargin: '200px' });

    const playbackObserver = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.1 });

    loadObserver.observe(section);
    playbackObserver.observe(section);
    video.addEventListener('canplay', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    motion.addEventListener('change', onMotionChange);

    return () => {
      loadObserver.disconnect();
      playbackObserver.disconnect();
      video.removeEventListener('canplay', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', onMotionChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!ready || !video) return;

    video.load();

    if (manualPlay.current || (visible.current && !reducedMotion.current)) {
      void video.play().catch(() => setPlaying(false));
    }
  }, [ready]);

  const togglePlayback = () => {
    const video = videoRef.current;

    if (!video) return;

    if (!video.paused) {
      userPaused.current = true;
      video.pause();
      return;
    }

    userPaused.current = false;
    manualPlay.current = true;
    setReady(true);
    void video.play().catch(() => setPlaying(false));
  };

  return (
    <section ref={sectionRef} className={styles.section} aria-label={copy.label}>
      <Image
        src='/video/product-video-poster.webp'
        alt=''
        fill
        sizes='(max-width: 640px) calc(100vw - 40px), (max-width: 1440px) calc(100vw - 64px), 1376px'
        className={styles.poster}
      />
      <video
        ref={videoRef}
        className={`${styles.video} ${hasFrame ? styles.loaded : ''}`}
        width={1280}
        height={720}
        preload='none'
        loop
        muted={muted}
        playsInline
        aria-label={copy.label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedData={() => setHasFrame(true)}
        onError={() => setFailed(true)}
      >
        {ready && <source src='/video/product-video.webm' type='video/webm'/>}
        {ready && <source src='/video/product-video.mp4' type='video/mp4'/>}
        <a href='/video/product-video.mp4'>{copy.fallback}</a>
      </video>
      {failed ? <a className={styles.fallback} href='/video/product-video.mp4'>{copy.fallback}</a> : (
        <div className={styles.controls}>
          <button type='button' aria-label={playing ? copy.pause : copy.play} onClick={togglePlayback}>
            <svg viewBox='0 0 24 24' width='22' height='22' fill='currentColor' aria-hidden='true'>
              <path d={playing ? 'M6 4h4v16H6zm8 0h4v16h-4z' : 'M7 4v16l14-8z'}/>
            </svg>
          </button>
          <button
            type='button'
            aria-label={muted ? copy.unmute : copy.mute}
            aria-pressed={!muted}
            onClick={() => setMuted(value => !value)}
          >
            <svg
              viewBox='0 0 24 24'
              width='22'
              height='22'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.7'
              strokeLinecap='round'
              strokeLinejoin='round'
              aria-hidden='true'
            >
              <path d='M11 4 5 9H2v6h3l6 5V4Z'/>
              <path d={muted ? 'm16 9 6 6m0-6-6 6' : 'M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16'}/>
            </svg>
          </button>
        </div>
      )}
    </section>
  );
};
