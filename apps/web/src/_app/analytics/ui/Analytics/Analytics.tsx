'use client';

import { useEffect } from 'react';
import Script from 'next/script';

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

export const Analytics = () => {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const enabled = Boolean(measurementId && /^G-[A-Z0-9]+$/.test(measurementId));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const link = event.target.closest<HTMLAnchorElement>('a[data-analytics-event="amazon_outbound_click"]');

      if (!link) {
        return;
      }

      (window as AnalyticsWindow).gtag?.('event', 'amazon_outbound_click', {
        link_url: link.href,
        link_location: link.dataset.analyticsLocation ?? 'unspecified',
        page_path: window.location.pathname,
      });
    };

    document.addEventListener('click', handleClick);

    return () => document.removeEventListener('click', handleClick);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy='afterInteractive'/>
      <Script id='ga4-init' strategy='afterInteractive'>
        {[
          'window.dataLayer = window.dataLayer || [];',
          'function gtag(){dataLayer.push(arguments);}',
          'window.gtag = gtag;',
          "gtag('js', new Date());",
          `gtag('config', '${measurementId}');`,
        ].join(' ')}
      </Script>
    </>
  );
};
