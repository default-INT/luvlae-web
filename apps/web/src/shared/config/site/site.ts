export const siteOrigin = 'https://www.luvlae.com';
export const siteUrl = (path = '/') => new URL(path, siteOrigin).href;
