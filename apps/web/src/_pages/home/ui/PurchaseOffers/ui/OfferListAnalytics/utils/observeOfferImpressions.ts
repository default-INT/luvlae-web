import { trackItemListEvent } from '@/shared/lib/analytics';

import type { ItemListParameters } from '@/shared/lib/analytics';

export const observeOfferImpressions = (
  element: HTMLElement, parameters: ItemListParameters, seen: Set<string>,
  Observer: typeof IntersectionObserver = IntersectionObserver,
  send: typeof trackItemListEvent = trackItemListEvent,
) => {
  const observer = new Observer(entries => {
    const visible = new Set(entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)
      .map(entry => entry.target.getAttribute('data-offer-id')));

    const items = parameters.items.filter(item => item.item_variant && visible.has(item.item_variant)
      && !seen.has(item.item_variant));

    if (!items.length || !send('view_item_list', { ...parameters, items })) return;

    for (const item of items) seen.add(item.item_variant!);

    for (const entry of entries) {
      if (seen.has(entry.target.getAttribute('data-offer-id') ?? '')) observer.unobserve(entry.target);
    }
  }, { threshold: 0.5 });

  element.querySelectorAll('[data-offer-id]').forEach(card => { observer.observe(card); });
  return () => observer.disconnect();
};
