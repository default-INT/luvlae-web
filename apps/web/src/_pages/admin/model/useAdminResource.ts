'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { adminRequest, AdminApiError } from '../api/admin';

import type { AdminCopy } from './types';

interface Resource<T> { path: string | null; data: T | null; loading: boolean; error: string }

export const useAdminResource = <T>(path: string | null, copy: AdminCopy) => {
  const router = useRouter();
  const lifecycle = useRef({ path, mounted: false, generation: 0, controller: null as AbortController | null });
  const [state, setState] = useState<Resource<T>>({ path: null, data: null, loading: false, error: '' });

  const reload = useCallback(async (): Promise<T | null> => {
    const request = lifecycle.current;

    if (!request.mounted || request.path !== path) return null;

    const current = ++request.generation;
    request.controller?.abort();

    if (!path) {
      setState({ path, data: null, loading: false, error: '' });
      return null;
    }

    const requestController = new AbortController();
    request.controller = requestController;
    setState(previous => ({ path, data: previous.path === path ? previous.data : null, loading: true, error: '' }));

    try {
      const data = await adminRequest<T>(path, undefined, 'GET', requestController.signal);

      if (current !== request.generation) return null;

      setState({ path, data, loading: false, error: '' });
      return data;
    } catch (failure) {
      if (current !== request.generation || requestController.signal.aborted) return null;

      if (failure instanceof AdminApiError && failure.status === 401) router.replace('/admin/login');

      const errors = copy.errors as Record<string, string>;
      const message = failure instanceof AdminApiError ? errors[failure.code] : undefined;
      setState({ path, data: null, loading: false, error: message ?? copy.requestError });
      return null;
    }
  }, [path, copy.errors, copy.requestError, router]);

  useEffect(() => {
    const request = lifecycle.current;
    request.path = path;
    request.mounted = true;
    let active = true;
    queueMicrotask(() => { if (active) void reload(); });

    return () => {
      active = false;
      request.mounted = false;
      request.generation++;
      request.controller?.abort();
    };
  }, [path, reload]);

  // Hide results belonging to a previous path immediately, before the next effect starts.
  const visible = state.path === path ? state : { path, data: null, loading: !!path, error: '' };
  return { ...visible, reload };
};
