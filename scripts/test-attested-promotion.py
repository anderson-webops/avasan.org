"""Exercise trusted static promotion only inside a disposable Linux namespace."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile


ROOT = Path('/usr/local/libexec/avasan.org')
BASE = Path('/srv/avasan.org')
SCRIPT = ROOT / 'deploy/direct/promote-attested-release.sh'
SPEC = importlib.util.spec_from_file_location('artifact', ROOT / 'deploy/direct/verified-static-artifact.py')
ARTIFACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARTIFACT)
assert os.geteuid() == 0 and not BASE.exists()


def encode(value):
    return (json.dumps(value, sort_keys=True) + '\n').encode()


def archive_for(commit, version, policy_overrides=None):
    contract = json.loads((ROOT / 'deploy/static-artifact.json').read_text())
    identity = {'revision': commit, 'version': version}
    provenance = {'commit': commit, 'version': version, 'branch': 'main', 'tag': f'v{version}',
                  'dirty': False, 'releaseVerified': True}
    public = {name: encode(identity) if name == 'release.json' else f'Synthetic {name}'.encode()
              for name in contract['required']}
    public['404.html'] = b'Page not found'
    policies = policy_overrides or {name: (ROOT / name).read_bytes()
                                     for name in contract['adapterFiles']}
    manifest = {
        'format': 1, 'contract': contract, 'identity': identity, 'provenance': provenance,
        'files': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
                  for name, data in public.items()},
        'adapterFiles': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
                         for name, data in policies.items()},
    }
    payload = {
        '.avasan-static-artifact.json': encode(manifest),
        '.avasan-static-release.json': encode(provenance),
        **{f"{contract['publicRoot']}/{name}": data for name, data in public.items()},
        **policies,
    }
    directories = {str(parent) for name in payload for parent in PurePosixPath(name).parents
                   if str(parent) != '.'}
    archive = BASE / 'artifact-incoming' / f'avasan-v{version}-{commit[:12]}-static.tar.gz'
    with tarfile.open(archive, 'w:gz') as bundle:
        for name in sorted(directories, key=lambda value: (value.count('/'), value)):
            member = tarfile.TarInfo(name + '/')
            member.type = tarfile.DIRTYPE
            bundle.addfile(member)
        for name, data in payload.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            bundle.addfile(member, io.BytesIO(data))
    return archive, hashlib.sha256(archive.read_bytes()).hexdigest()


def invoke(archive, digest, commit, version, previous, mode):
    return subprocess.run(
        ['bash', str(SCRIPT), str(archive), str(BASE / 'artifact-incoming/attestation.jsonl'),
         digest, commit, version, previous],
        env={**os.environ, 'FIXTURE_MODE': mode}, capture_output=True, text=True,
        timeout=30, check=False,
    )


BASE.mkdir(mode=0o755)
releases = BASE / 'artifact-releases'
incoming = BASE / 'artifact-incoming'
recovery = BASE / '.deployment-recovery'
releases.mkdir(mode=0o755)
incoming.mkdir(mode=0o700)
recovery.mkdir(mode=0o700)
Path('/etc/nginx/snippets').mkdir(parents=True, exist_ok=True)
(incoming / 'attestation.jsonl').write_text('synthetic attestation checked by the fixture command')
previous_commit = 'b' * 40
candidate_commit = 'a' * 40
contract = json.loads((ROOT / 'deploy/static-artifact.json').read_text())
previous_policies = {name: (ROOT / name).read_bytes() + b'\n# retained policy\n'
                     for name in contract['adapterFiles']}
old_policy_root = Path('/tmp/previous-policy')
old_policy_root.mkdir()
for name, data in previous_policies.items():
    (old_policy_root / PurePosixPath(name).name).write_bytes(data)
previous_archive, previous_sha = archive_for(previous_commit, '1.2.12', previous_policies)
candidate_archive, candidate_sha = archive_for(candidate_commit, '1.2.13')
previous = releases / 'previous'
previous.mkdir(mode=0o700)
current_policy_root = ARTIFACT.POLICY_ROOT
ARTIFACT.POLICY_ROOT = old_policy_root
try:
    ARTIFACT.unpack_verified(previous_archive, previous_sha, previous_commit, '1.2.12', previous)
finally:
    ARTIFACT.POLICY_ROOT = current_policy_root
current = BASE / 'current'
current.symlink_to(previous)
for name in ['http-maps', 'server-policy']:
    shutil.copyfile(previous / f'deploy/nginx/{name}.conf',
                    Path(f'/etc/nginx/snippets/avasan.org-{name}.conf'))

result = invoke(candidate_archive, candidate_sha, candidate_commit, '1.2.13', previous_commit, 'success')
assert result.returncode == 0, result.stderr
candidate = current.resolve()
assert candidate != previous and candidate.parent == releases
for name in ['http-maps', 'server-policy']:
    installed = Path(f'/etc/nginx/snippets/avasan.org-{name}.conf').read_bytes()
    assert installed == (candidate / f'deploy/nginx/{name}.conf').read_bytes()
    assert installed != (previous / f'deploy/nginx/{name}.conf').read_bytes()
assert (BASE / 'gh-called').read_text() == 'attestation verify'
assert 'avasan.org:443:127.0.0.1' in (BASE / 'probes').read_text()
assert 'avasan.org:443:[::1]' in (BASE / 'probes').read_text()
ARTIFACT.verify_tree(candidate, json.loads((candidate / '.avasan-static-artifact.json').read_text()))
assert not list(recovery.glob('promotion-state-*'))
print(json.dumps({'attestedPromotion': 'success', 'result': 'passed'}), flush=True)

current.unlink()
current.symlink_to(previous)
for name in ['http-maps', 'server-policy']:
    shutil.copyfile(previous / f'deploy/nginx/{name}.conf',
                    Path(f'/etc/nginx/snippets/avasan.org-{name}.conf'))
result = invoke(candidate_archive, candidate_sha, candidate_commit, '1.2.13', previous_commit, 'bad-health')
assert result.returncode != 0 and 'Restored and verified' in result.stderr, result.stderr
assert current.resolve() == previous
assert not list(recovery.glob('promotion-state-*'))
assert not list(recovery.glob('avasan-*'))
for name in ['http-maps', 'server-policy']:
    assert Path(f'/etc/nginx/snippets/avasan.org-{name}.conf').read_bytes() == (
        previous / f'deploy/nginx/{name}.conf').read_bytes()
print(json.dumps({'attestedPromotion': 'failed activation rollback', 'result': 'passed'}), flush=True)

result = invoke(Path('/tmp/unprotected.tar.gz'), candidate_sha, candidate_commit,
                '1.2.13', previous_commit, 'success')
assert result.returncode != 0 and current.resolve() == previous
print(json.dumps({'attestedPromotion': 'unprotected input rejected', 'result': 'passed'}), flush=True)

nested = releases / 'deploy-writable'
nested.mkdir(mode=0o755)
shutil.copytree(previous, nested / 'previous')
nested.chmod(0o777)
current.unlink()
current.symlink_to(nested / 'previous')
result = invoke(candidate_archive, candidate_sha, candidate_commit, '1.2.13',
                previous_commit, 'success')
assert result.returncode != 0 and 'direct protected child' in result.stderr, result.stderr
assert current.resolve() == nested / 'previous'
current.unlink()
current.symlink_to(previous)
print(json.dumps({'attestedPromotion': 'nested rollback target rejected', 'result': 'passed'}), flush=True)

result = invoke(candidate_archive, candidate_sha, candidate_commit, '1.2.13',
                previous_commit, 'bad-rollback-headers')
assert result.returncode != 0 and 'CRITICAL: protected rollback evidence retained' in result.stderr, result.stderr
assert current.resolve() == previous
assert list(recovery.glob('promotion-state-*')) and list(recovery.glob('avasan-*'))
print(json.dumps({'attestedPromotion': 'weak rollback readiness rejected', 'result': 'passed'}), flush=True)
