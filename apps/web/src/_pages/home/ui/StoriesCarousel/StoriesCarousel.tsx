'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label: string;
  previousLabel: string;
  nextLabel: string;
}

export const StoriesCarousel = (props: Props) => {
  const { children, label, previousLabel, nextLabel } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const track = trackRef.current;

    if (!track) return;

    const updateEdges = () => {
      setEdges({ start: track.scrollLeft <= 1, end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 1 });
    };

    const containHorizontalWheel = (event: WheelEvent) => {
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);

      if (!horizontal) return;

      const delta = event.deltaX || event.deltaY;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const atStart = delta < 0 && track.scrollLeft <= 1;
      const atEnd = delta > 0 && track.scrollLeft >= maxScroll - 1;

      if (atStart || atEnd) event.preventDefault();
    };

    updateEdges();
    track.addEventListener('scroll', updateEdges, { passive: true });
    track.addEventListener('wheel', containHorizontalWheel, { passive: false });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(track);

    return () => {
      track.removeEventListener('scroll', updateEdges);
      track.removeEventListener('wheel', containHorizontalWheel);
      observer.disconnect();
    };
  }, []);

  const move = (direction: number) => {
    const track = trackRef.current;
    const firstCard = track?.firstElementChild;

    if (!track || !(firstCard instanceof HTMLElement)) return;

    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = firstCard.offsetWidth + gap;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const left = Math.max(0, Math.min(maxScroll, track.scrollLeft + direction * distance));
    track.scrollTo({ left, behavior: reducedMotion ? 'instant' : 'smooth' });
  };

  return (
    <div className={styles.carousel}>
      <div className={styles.controls}>
        <button
          type='button'
          aria-label={previousLabel}
          aria-controls={trackId}
          disabled={edges.start}
          onClick={() => move(-1)}
        >
          <span aria-hidden='true'>←</span>
        </button>
        <button
          type='button'
          aria-label={nextLabel}
          aria-controls={trackId}
          disabled={edges.end}
          onClick={() => move(1)}
        >
          <span aria-hidden='true'>→</span>
        </button>
      </div>
      <div id={trackId} ref={trackRef} className={styles.track} role='region' aria-label={label} tabIndex={0}>
        {children}
      </div>
    </div>
  );
};
