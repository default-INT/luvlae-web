'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  href: string;
  children: string;
}

export const HeaderLink = (props: Props) => {
  const { href, children } = props;
  const pathname = usePathname();
  const target = href.split('?')[0];
  const active = pathname?.replace(/\/$/, '') === target;

  return <Link href={href} aria-current={active ? 'page' : undefined}>{children}</Link>;
};
