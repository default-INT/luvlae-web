import 'server-only';

import { MongoServerError, MongoNetworkError, MongoServerSelectionError } from 'mongodb';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const fail = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};

export const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json({ data }, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers },
});

export const handle = (operation: () => Promise<Response>) => async () => {
  try {
    return await operation();
  } catch (error) {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'The request could not be completed.';

    if (error instanceof ApiError) {
      ({ status, code, message } = error);
    } else if (error instanceof z.ZodError) {
      status = 400;
      code = 'INVALID_INPUT';
      message = 'Request validation failed.';
    } else if (error instanceof MongoServerError && error.code === 11000) {
      status = 409;
      code = 'CONFLICT';
      message = 'A unique record already exists.';
    } else if (error instanceof MongoNetworkError || error instanceof MongoServerSelectionError) {
      status = 503;
      code = 'DATABASE_UNAVAILABLE';
      message = 'The database is temporarily unavailable.';
    }

    // Never log request bodies, provider payloads, connection strings, or error messages with PII.
    if (status >= 500) console.error('Commerce API error', { code });

    return Response.json({ error: { code, message } }, {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
};

export const readJson = async <T>(request: Request, schema: z.ZodType<T>): Promise<T> => {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }

  const reader = request.body?.getReader();
  if (!reader) return fail(400, 'INVALID_INPUT', 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        fail(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail(400, 'INVALID_JSON', 'A valid JSON body is required.');
  }
  return schema.parse(body);
};

export const requireOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) {
    fail(403, 'INVALID_ORIGIN', 'A same-origin request is required.');
  }
};
