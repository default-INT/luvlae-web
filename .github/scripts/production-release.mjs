import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const releasePattern = /^refs\/heads\/release\/release-(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function isNewer(version, current) {
  for (let index = 0; index < version.length; index += 1) {
    if (version[index] !== current[index]) {
      return version[index] > current[index];
    }
  }

  return false;
}

export function canDeployRelease(remoteRefs, ref, sha) {
  if (!releasePattern.test(ref) || !sha) {
    return false;
  }

  const releases = remoteRefs.trim().split('\n').flatMap((line) => {
    const [head, name] = line.trim().split(/\s+/);
    const match = releasePattern.exec(name ?? '');

    return match ? [{ head, name, version: match.slice(1).map(BigInt) }] : [];
  });
  const latest = releases.reduce(
    (current, release) => !current || isNewer(release.version, current.version) ? release : current,
    undefined,
  );

  return latest?.name === ref && latest.head === sha;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Read live remote refs rather than checkout refs, which may already be stale.
  // A failed remote lookup throws and prevents deployment.
  const refs = execFileSync('git', ['ls-remote', '--heads', 'origin', 'refs/heads/release/release-*'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  const deploy = canDeployRelease(refs, process.env.GITHUB_REF, process.env.GITHUB_SHA);

  if (!deploy) {
    console.error('::notice::Production deployment skipped: this is not the current head of the highest numbered release branch.');
  }

  console.log(`deploy=${deploy}`);
}
