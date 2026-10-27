import { siteOrigin } from '@/shared/config/site';

export interface AnalyticsItem {
  item_id: string; item_name: string; price: number; quantity: number;
}

export interface EcommerceParameters {
  currency: 'USD'; value: number; items: AnalyticsItem[]; transaction_id?: string;
}

export type EcommerceEventName = 'view_item' | 'add_to_cart' | 'remove_from_cart' | 'view_cart' | 'begin_checkout' | 'purchase';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

const recorded = new Set<string>();
let initialized = false;

export const analyticsMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const isAnalyticsEnabled = () => typeof window !== 'undefined'
  && process.env.NEXT_PUBLIC_APP_ENV === 'production'
  && window.location.origin === siteOrigin
  && Boolean(analyticsMeasurementId && /^G-[A-Z0-9]+$/.test(analyticsMeasurementId));

export const analyticsLocation = (href: string) => {
  const url = new URL(href, siteOrigin);

  if (/^\/(?:orders?|admin|api)(?:\/|$)/.test(url.pathname)) {
    url.pathname = url.pathname.endsWith('/checkout') ? '/checkout' : '/order-status';
  }

  url.search = '';
  url.hash = '';
  return url.href;
};

const pageParameters = () => ({
  page_location: analyticsLocation(window.location.href),
  page_referrer: document.referrer ? analyticsLocation(document.referrer) : '',
  page_title: document.title,
});

export const initializeAnalytics = () => {
  if (!isAnalyticsEnabled()) return false;

  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params -- Keep Google's documented arguments-object queue format.
  target.gtag ??= function () { target.dataLayer!.push(arguments); };

  if (!initialized) {
    target.gtag('js', new Date());
    target.gtag('config', analyticsMeasurementId, { send_page_view: false, ...pageParameters() });
    initialized = true;
  }

  return true;
};

export const trackPageView = () => {
  if (!isAnalyticsEnabled() || /^\/admin(?:\/|$)/.test(window.location.pathname) || !initializeAnalytics()) return;

  (window as AnalyticsWindow).gtag!('set', pageParameters());
  (window as AnalyticsWindow).gtag!('event', 'page_view', pageParameters());
};

export const trackEcommerceEvent = (name: EcommerceEventName, parameters: EcommerceParameters, onceKey?: string) => {
  if (!initializeAnalytics() || !parameters.items.length) return false;

  const key = onceKey ? `luvlae-analytics:${name}:${onceKey}` : undefined;

  if (key) {
    if (recorded.has(key)) return false;

    try { if (localStorage.getItem(key)) return false; }
    catch { /* In-memory and GA transaction-id deduplication still apply when storage is blocked. */ }
  }

  // Copy only the ecommerce contract; never forward customer fields, access tokens or provider payloads.
  const event = {
    currency: parameters.currency, value: parameters.value,
    items: parameters.items.map(item => ({
      item_id: item.item_id, item_name: item.item_name, price: item.price, quantity: item.quantity,
    })),
    ...(name === 'purchase' ? { transaction_id: parameters.transaction_id } : {}),
    ...pageParameters(),
  };

  if (name === 'purchase' && !event.transaction_id) return false;

  try { (window as AnalyticsWindow).gtag!('event', name, event); }
  catch { return false; }

  if (key) {
    recorded.add(key);

    try { localStorage.setItem(key, '1'); }
    catch { /* Analytics must never prevent shopping or payment recovery. */ }
  }

  return true;
};
