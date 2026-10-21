'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  closeDisabled?: boolean;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

const scrollLocks = new WeakMap<Document, { count: number; overflow: string }>();

const lockScroll = (document: Document) => {
  const lock = scrollLocks.get(document) ?? { count: 0, overflow: document.body.style.overflow };
  lock.count++;
  scrollLocks.set(document, lock);
  document.body.style.overflow = 'hidden';

  return () => {
    lock.count--;

    if (!lock.count) {
      document.body.style.overflow = lock.overflow;
      scrollLocks.delete(document);
    }
  };
};

export const Drawer = (props: Props) => {
  const { open, onClose, onAfterClose, closeDisabled = false, labelledBy, className = '', children } = props;
  const [present, setPresent] = useState(open);
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef<number | null>(null);
  const callbacks = useRef({ onClose, onAfterClose });

  useEffect(() => { callbacks.current = { onClose, onAfterClose }; }, [onClose, onAfterClose]);

  if (open && !present) setPresent(true);

  useEffect(() => {
    const element = dialog.current;

    if (!present || !element) return;

    const previousFocus = element.ownerDocument.activeElement;
    const unlock = lockScroll(element.ownerDocument);

    if (!element.open) element.showModal();

    return () => {
      element.close();
      unlock();

      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [present]);

  useEffect(() => {
    const element = dialog.current;

    if (!present || !element) return;

    element.dataset.state = open || closeDisabled ? 'open' : 'closing';

    if (open || closeDisabled) return;

    let cancelled = false;

    const finish = () => {
      if (cancelled) return;

      cancelled = true;
      element.close();
      setPresent(false);
      callbacks.current.onAfterClose?.();
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = reducedMotion.matches ? [] : element.getAnimations();

    if (animations.length) void Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
    else finish();

    const motionChanged = () => { if (reducedMotion.matches) finish(); };
    reducedMotion.addEventListener('change', motionChanged);

    return () => {
      cancelled = true;
      reducedMotion.removeEventListener('change', motionChanged);
    };
  }, [open, present, closeDisabled]);

  if (!present) return null;

  const outside = (x: number, y: number) => {
    const bounds = dialog.current?.getBoundingClientRect();
    return !!bounds && (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom);
  };

  return (
    <dialog ref={dialog} className={`${styles.drawer} ${className}`} aria-labelledby={labelledBy}
      onCancel={event => {
        event.preventDefault();

        if (!closeDisabled) onClose();
      }}
      onPointerDown={event => {
        backdropPointer.current = event.button === 0 && outside(event.clientX, event.clientY) ? event.pointerId : null;
      }}
      onPointerCancel={() => { backdropPointer.current = null; }}
      onPointerUp={event => {
        const startedOutside = backdropPointer.current === event.pointerId;
        backdropPointer.current = null;

        if (!closeDisabled && startedOutside && outside(event.clientX, event.clientY)) onClose();
      }}>
      {children}
    </dialog>
  );
};
