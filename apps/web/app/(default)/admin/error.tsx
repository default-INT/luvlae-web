'use client';

import { AdminError } from '@/_pages/admin';
import { dictionaryShape } from '@/shared/config/i18n/dictionary';

interface Props { reset: () => void }

export default function ErrorRoute(props: Props) {
  const { admin } = dictionaryShape;
  return <AdminError reset={props.reset} message={admin.requestError} retry={admin.retry} orders={admin.backOrders}/>;
}
