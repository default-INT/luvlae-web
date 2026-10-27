'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { analyticsMeasurementId, trackPageView } from '@/shared/lib/analytics';

export const Analytics = () => {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  const enabled = process.env.NEXT_PUBLIC_APP_ENV === 'production'
    && Boolean(analyticsMeasurementId && /^G-[A-Z0-9]+$/.test(analyticsMeasurementId));

  useEffect(() => {
    if (!enabled || lastPath.current === pathname) return;

    trackPageView();
    lastPath.current = pathname;
  }, [enabled, pathname]);

  if (!enabled || /^\/admin(?:\/|$)/.test(pathname)) {
    return null;
  }

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${analyticsMeasurementId}`} strategy='afterInteractive'/>;
};
