import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MongoServerError } from 'mongodb';

import { handle } from '../src/shared/lib/api/index.server';

test('server diagnostics retain database failure codes without exposing secrets in logs or HTTP responses', async context => {
  const output: unknown[][] = [];
  context.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });

  const response = await handle(async () => {
    throw new MongoServerError({ message: 'private-connection-string-and-credentials', code: 13 });
  })();

  assert.equal(response.status, 500);
  assert.deepEqual(output, [['Commerce API error', { code: 'INTERNAL_ERROR', errorType: 'MongoServerError', databaseCode: 13 }]]);
  assert.deepEqual(await response.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
  });
  assert.equal(JSON.stringify(output).includes('private-connection'), false);
});

test('runtime diagnostics allow only known exception categories, never arbitrary exception names or messages', async context => {
  const output: unknown[][] = [];
  context.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });

  for (const error of [
    new TypeError('private-runtime-details'), new DOMException('private-runtime-details', 'NotSupportedError'),
    Object.assign(new Error('private'), { name: 'private-name' }),
  ]) {
    await handle(async () => { throw error; })();
  }

  assert.deepEqual(output, [
    ['Commerce API error', { code: 'INTERNAL_ERROR', errorType: 'TypeError' }],
    ['Commerce API error', { code: 'INTERNAL_ERROR', errorType: 'NotSupportedError' }],
    ['Commerce API error', { code: 'INTERNAL_ERROR', errorType: 'Error' }],
  ]);
});
