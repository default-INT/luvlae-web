'use client';

import { useEffect, useRef } from 'react';

export const useOrderPaymentPolling = (active: boolean, reload: () => Promise<void>) => {
  const latestReload = useRef(reload);
  useEffect(() => { latestReload.current = reload; }, [reload]);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120000;

    const poll = async () => {
      if (disposed || Date.now() >= deadline) return;

      if (document.visibilityState === 'visible') await latestReload.current().catch(() => {});

      if (!disposed) timer = setTimeout(() => { void poll(); }, 4000);
    };

    timer = setTimeout(() => { void poll(); }, 4000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active]);
};
