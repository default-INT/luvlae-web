'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export const Reveal = (props: Props) => {
  const { children, className = '' } = props;
  const elementRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || !('IntersectionObserver' in window)) {
      return;
    }

    setReady(true);

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const classes = [styles.reveal, ready && styles.ready, visible && styles.visible, className].filter(Boolean).join(' ');

  return (
    <div ref={elementRef} className={classes}>
      {children}
    </div>
  );
};
