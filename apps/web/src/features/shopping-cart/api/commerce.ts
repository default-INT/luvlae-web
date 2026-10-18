export const commerceRequest = async <T>(path: string, body?: unknown, token?: string): Promise<T> => {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json() as { data: T; error?: { code: string } };
  if (!response.ok) throw new Error(result.error?.code ?? 'REQUEST_FAILED');
  return result.data as T;
};
