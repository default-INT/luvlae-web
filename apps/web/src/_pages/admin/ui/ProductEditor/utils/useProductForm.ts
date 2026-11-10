import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { adminRequest, AdminApiError } from '../../../api/admin';

import { createProductMutation } from './productMutation';

import type { AdminCopy } from '../../../model/types';

export const useProductForm = (
  copy: AdminCopy, initialVersion: number, reload: () => Promise<void>, onBusyChange: (busy: boolean) => void,
) => {
  const router = useRouter();
  const [version, updateVersion] = useState(initialVersion);
  const [validation, setValidation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [phase, setPhase] = useState('idle');

  const [transaction] = useState(() => createProductMutation({
    send: adminRequest, reload, operationId: () => crypto.randomUUID(),
  }));

  const perform = async (operation: () => ReturnType<typeof transaction.run>) => {
    if (busy || transaction.phase === 'writing' || transaction.phase === 'refreshing') return false;

    setValidation('');
    setBusy(true);
    onBusyChange(true);
    setError('');
    setSaved(false);

    try {
      const result = await operation();

      if (result.kind === 'saved' || result.kind === 'acceptedRefreshFailed') {
        updateVersion(result.version);
        setSaved(true);
        return true;
      }

      if (result.kind === 'failed') {
        const failure = result.failure;
        const code = failure instanceof AdminApiError ? failure.code : '';
        setError((copy.errors as Record<string, string>)[code] ?? copy.requestError);

        if (failure instanceof AdminApiError && failure.status === 401) router.replace('/admin/login');

        if (code === 'VERSION_CONFLICT' || code === 'INVENTORY_VERSION_CONFLICT') await reload().catch(() => {});
      }

      return false;
    } finally {
      setPhase(transaction.phase);
      setBusy(false);
      onBusyChange(false);
    }
  };

  const run = (path: string, body: Record<string, unknown>, method = 'POST') => {
    if (!transaction.canEdit) return Promise.resolve(false);

    return perform(() => transaction.run(path, body, version, method));
  };

  const setVersion = (value: number) => {
    if (transaction.canEdit && !busy) updateVersion(value);
  };

  const retry = () => perform(() => transaction.retry());

  return { version, setVersion, validation, setValidation, run, retry, locked: phase !== 'idle' || busy,
    mutation: { busy, error, saved, uncertain: phase === 'uncertain', refreshFailed: phase === 'accepted' } };
};
