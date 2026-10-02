import { NextResponse, type NextRequest } from 'next/server';

import { defaultLocale, locales } from './src/shared/config/i18n';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split('/')[1];

  if (locales.some(locale => locale === firstSegment)) {
    if (firstSegment === defaultLocale) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.slice(`/${defaultLocale}`.length) || '/';

      return NextResponse.redirect(url, 308);
    }

    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === '/' ? '' : pathname}`;

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
