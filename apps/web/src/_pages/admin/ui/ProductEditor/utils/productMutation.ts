import { AdminApiError } from '../../../api/admin';

interface Request {
  path: string;
  bodyJson: string;
  method: string;
  version: number;
}

type Phase = 'idle' | 'writing' | 'uncertain' | 'accepted' | 'refreshing';
type Result = { kind: 'blocked' } | { kind: 'failed'; failure: unknown }
  | { kind: 'saved' | 'acceptedRefreshFailed'; version: number };

interface Dependencies {
  send: (path: string, body: Record<string, unknown>, method: string) => Promise<unknown>;
  reload: () => Promise<void>;
  operationId: () => string;
}

export const createProductMutation = (dependencies: Dependencies) => {
  let phase: Phase = 'idle';
  let request: Request | null = null;

  const refreshAccepted = async (): Promise<Result> => {
    if (!request) return { kind: 'blocked' };

    const version = request.version + 1;
    phase = 'refreshing';

    try {
      await dependencies.reload();
      request = null;
      phase = 'idle';
      return { kind: 'saved', version };
    } catch {
      // The write succeeded. Only readback may be retried now.
      phase = 'accepted';
      return { kind: 'acceptedRefreshFailed', version };
    }
  };

  const write = async (): Promise<Result> => {
    if (!request) return { kind: 'blocked' };

    phase = 'writing';

    try {
      await dependencies.send(request.path, JSON.parse(request.bodyJson) as Record<string, unknown>, request.method);
    } catch (failure) {
      const uncertain = !(failure instanceof AdminApiError) || failure.status >= 500 || failure.code === 'CONFLICT';
      phase = uncertain ? 'uncertain' : 'idle';

      if (!uncertain) request = null;

      return { kind: 'failed', failure };
    }

    phase = 'accepted';
    return refreshAccepted();
  };

  const run = (path: string, body: Record<string, unknown>, version: number, method = 'POST'): Promise<Result> => {
    if (phase !== 'idle') return Promise.resolve({ kind: 'blocked' });

    request = { path, method, version,
      bodyJson: JSON.stringify({ ...body, operationId: dependencies.operationId() }) };
    return write();
  };

  const retry = (): Promise<Result> => {
    if (phase === 'uncertain') return write();

    if (phase === 'accepted') return refreshAccepted();

    return Promise.resolve({ kind: 'blocked' });
  };

  return { run, retry, get phase() { return phase; }, get canEdit() { return phase === 'idle'; } };
};
