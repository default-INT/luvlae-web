import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const getDeployment = (environment = 'production') => {
  if (!['stage', 'production'].includes(environment)) {
    throw new Error(`Unsupported deployment environment: ${environment}`);
  }

  return { environment, worker: environment === 'stage' ? 'luvlae-web-stage' : 'luvlae-web' };
};

export const verifyArtifact = (root, deployment) => {
  const output = path.join(root, '.cloudflare/output/v0/workers/default');
  const config = JSON.parse(readFileSync(path.join(output, 'worker.config.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(output, 'deployment.json'), 'utf8'));

  if (config.name !== deployment.worker || manifest.environment !== deployment.environment) {
    throw new Error(`Build does not target ${deployment.environment}/${deployment.worker}. Rebuild before deploying.`);
  }

  const headersFile = path.join(output, 'assets/_headers');
  if (deployment.environment === 'stage') {
    if (!readFileSync(headersFile, 'utf8').includes('X-Robots-Tag: noindex')) {
      throw new Error('Stage static assets must disable indexing. Rebuild before deploying.');
    }
  } else if (existsSync(headersFile) && /X-Robots-Tag:\s*noindex/i.test(readFileSync(headersFile, 'utf8'))) {
    throw new Error('Unexpected stage static headers in production. Rebuild before deploying.');
  }

  return output;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...flags] = process.argv.slice(2);
  if (!['build', 'deploy', 'preview'].includes(command) || flags.some(flag => flag !== '--skip-build')) {
    throw new Error('Usage: cloudflare.mjs build|deploy|preview [--skip-build] (DEPLOY_ENV=stage|production)');
  }

  const deployment = getDeployment(process.env.DEPLOY_ENV);
  const root = path.resolve(import.meta.dirname, '..');
  const env = {
    ...process.env,
    NEXT_PUBLIC_APP_ENV: deployment.environment,
    ...(deployment.environment === 'stage' ? { NEXT_PUBLIC_GA_MEASUREMENT_ID: '' } : {}),
  };
  const run = (args) => {
    const result = spawnSync('pnpm', args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  };

  if (command === 'build' || (command === 'deploy' && !flags.includes('--skip-build'))) {
    // Vite can retain files written after its previous build (for example, stage headers).
    rmSync(path.join(root, '.cloudflare/output'), { recursive: true, force: true });
    run(['exec', 'node', 'scripts/generate-dictionaries.mjs']);
    run(['exec', 'vite', 'build', '--mode', deployment.environment]);
    const output = path.join(root, '.cloudflare/output/v0/workers/default');
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: deployment.environment }));
    if (deployment.environment === 'stage') {
      const headersFile = path.join(output, 'assets/_headers');
      const headers = existsSync(headersFile) ? readFileSync(headersFile, 'utf8') : '';
      writeFileSync(headersFile, `${headers}\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`);
    }
  }

  verifyArtifact(root, deployment);
  if (command === 'deploy') {
    run(['exec', 'vinext-cloudflare', 'deploy', '--skip-build', '--env', deployment.environment]);
  } else if (command === 'preview') {
    run(['exec', 'vite', 'preview', '--mode', deployment.environment]);
  }
}
