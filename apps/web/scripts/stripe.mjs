import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';

const root = fileURLToPath(new URL('../', import.meta.url));
nextEnv.loadEnvConfig(root, true, { info: () => {}, error: () => {} });
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith('sk_test_')) throw new Error('Set STRIPE_SECRET_KEY to a sandbox sk_test_ key in apps/web/.env.local.');
const require = createRequire(import.meta.url);
const shim = fileURLToPath(new URL('bin/shim.js', `file://${require.resolve('@stripe/cli/package.json')}`));

const events = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
].join(',');

const run = args => spawn(process.execPath, [shim, ...args], {
  cwd: root, env: { ...process.env, STRIPE_API_KEY: key }, stdio: ['ignore', 'pipe', 'pipe'],
});

const redact = text => text.toString().replace(/(?:whsec_|sk_test_|rk_test_)[A-Za-z0-9_]+/g, '[redacted]');
const command = process.argv[2] ?? 'listen';
let args;
if (command === 'listen') {
  const target = new URL(process.argv[3] ?? 'http://localhost:3000/api/webhooks/stripe');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !['http:', 'https:'].includes(target.protocol)) {
    throw new Error('The local Stripe listener requires a localhost forwarding URL.');
  }
  const secretProcess = run(['listen', '--print-secret']);
  let output = '';
  secretProcess.stdout.on('data', chunk => { output += chunk; });
  secretProcess.stderr.on('data', chunk => process.stderr.write(redact(chunk)));
  const status = await new Promise(resolve => secretProcess.on('close', resolve));
  const secret = output.match(/whsec_[A-Za-z0-9_]+/)?.[0];
  if (status !== 0 || !secret) throw new Error('Could not obtain the local Stripe signing secret. Check sandbox API access.');
  const envPath = new URL('../.env.local', import.meta.url);
  let contents = await readFile(envPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (/^STRIPE_WEBHOOK_SECRET=.*$/m.test(contents)) {
    contents = contents.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${secret}`);
  } else contents += `\nSTRIPE_WEBHOOK_SECRET=${secret}\n`;
  await writeFile(envPath, contents, { mode: 0o600 });
  console.log(`Local signing secret saved to apps/web/.env.local. Start/restart the app. Forwarding to ${target.href}`);
  args = ['listen', '--events', events, '--forward-to', target.href];
} else if (command === 'trigger') {
  args = ['trigger', 'checkout.session.completed'];
} else if (command === 'version') args = ['version'];
else throw new Error('Use listen [localhost URL], trigger, or version.');
const child = run(args);
child.stdout.on('data', chunk => process.stdout.write(redact(chunk)));
child.stderr.on('data', chunk => process.stderr.write(redact(chunk)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('close', code => { process.exitCode = code ?? 1; });
