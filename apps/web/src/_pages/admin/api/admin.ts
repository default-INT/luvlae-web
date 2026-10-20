export class AdminApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

export const adminRequest = async <T>(
  path: string, body?: unknown, method = 'POST', signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(`/api/admin${path}`, {
    method: body === undefined ? 'GET' : method,
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });

  const result = await response.json() as { data: T; error?: { code: string } };

  if (!response.ok) {
    throw new AdminApiError(result.error?.code ?? 'REQUEST_FAILED', response.status);
  }

  return result.data;
};
