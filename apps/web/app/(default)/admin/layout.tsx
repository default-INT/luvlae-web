import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Luvlae Admin', robots: { index: false, follow: false } };
interface Props { children: ReactNode }
export default function AdminRootLayout(props: Props) { return props.children; }
