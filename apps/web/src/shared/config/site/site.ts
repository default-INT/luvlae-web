export const siteOrigin = 'https://www.luvlae.com';
export const siteUrl = (path = '/') => new URL(path, siteOrigin).href;

export const defaultOgImage = {
  url: '/images/luvlae-berberine-woman-with-patches.webp',
  width: 1280,
  height: 853,
  alt: 'Woman holding a Luvlae Berberine Patches box',
};
