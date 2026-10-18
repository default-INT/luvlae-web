import assert from 'node:assert/strict';
import test from 'node:test';
import { canDeployRelease } from './production-release.mjs';

const ref = (version) => `refs/heads/release/release-${version}`;
const refs = [
  `aaa\t${ref('0.0.9')}`,
  `bbb\t${ref('0.0.10')}`,
  `ccc\t${ref('0.0.2')}`,
  `ddd\t${ref('0.0.999-invalid')}`,
].join('\n');

test('deploys creation or updates of the highest numbered release, using numeric order', () => {
  assert.equal(canDeployRelease(refs, ref('0.0.10'), 'bbb'), true);
});

test('does not deploy commits to an older release', () => {
  assert.equal(canDeployRelease(refs, ref('0.0.9'), 'aaa'), false);
});

test('does not deploy an outdated run after the release head changes', () => {
  assert.equal(canDeployRelease(refs, ref('0.0.10'), 'old-sha'), false);
});

test('compares major, minor and patch numerically in priority order', () => {
  for (const [older, newer] of [
    ['0.99.99', '1.0.0'],
    ['1.9.99', '1.10.0'],
    ['1.10.9', '1.10.10'],
    ['9.99.99', '10.0.0'],
    ['1.0.9007199254740992', '1.0.9007199254740993'],
  ]) {
    const remoteRefs = `old\t${ref(older)}\nnew\t${ref(newer)}`;
    assert.equal(canDeployRelease(remoteRefs, ref(newer), 'new'), true);
    assert.equal(canDeployRelease(remoteRefs, ref(older), 'old'), false);
  }
});

test('does not deploy main, malformed names, tags, missing or deleted releases', () => {
  for (const name of ['refs/heads/main', ref('0.0.010'), ref('01.0.0'), ref('1.01.0'), ref('0.0.x'), ref('1.2'), ref('1.2.3.4'), ref('1.2.3-rc.1'), 'refs/tags/release-0.0.10']) {
    assert.equal(canDeployRelease(refs, name, 'bbb'), false);
  }
  assert.equal(canDeployRelease('', ref('0.0.10'), 'bbb'), false);
  assert.equal(canDeployRelease(refs, ref('0.0.11'), 'bbb'), false);
  assert.equal(canDeployRelease(refs, ref('0.0.10'), undefined), false);
});
