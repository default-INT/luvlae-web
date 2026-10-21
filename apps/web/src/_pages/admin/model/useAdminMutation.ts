'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { adminRequest, AdminApiError } from '../api/admin';

import type { AdminCopy } from './types';

export const useAdminMutation = (copy: AdminCopy, reload: () => Promise<void>, onBusyChange?: (busy: boolean) => void) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const locked = useRef(false);
  const pending = useRef<{ signature: string; operationId: string } | null>(null);

  const run = async (path: string, body: Record<string, unknown>, method = 'POST') => {
    if (locked.current) return;

    locked.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setUncertain(false);
    setSaved(false);
    const signature = JSON.stringify({ path, body, method });

    if (pending.current?.signature !== signature) {
      pending.current = { signature,
        operationId: typeof body.operationId === 'string' ? body.operationId : crypto.randomUUID() };
    }

    try {
      await adminRequest(path, { ...body, operationId: pending.current.operationId }, method);
      pending.current = null;
      setSaved(true);
      await reload();
      return true;
    } catch (failure) {
      const code = failure instanceof AdminApiError ? failure.code : '';
      setUncertain(!(failure instanceof AdminApiError) || failure.status >= 500 || code === 'CONFLICT');

      if (failure instanceof AdminApiError && failure.status === 401) {
        router.replace('/admin/login');
      }

      const errors = copy.errors as Record<string, string>;
      setError(errors[code] ?? copy.requestError);

      if (failure instanceof AdminApiError && failure.status < 500 && code !== 'CONFLICT') pending.current = null;

      if (code === 'VERSION_CONFLICT') await reload().catch(() => {});

      return false;
    } finally {
      locked.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return { busy, error, uncertain, saved, run };
};
