import { AdminGuard } from '@/_app/admin/AdminGuard';

import type { ReactNode } from 'react';

interface Props { children: ReactNode }
export default function ProtectedLayout(props: Props) { return <AdminGuard>{props.children}</AdminGuard>; }
