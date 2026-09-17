"""Exercise the real promoter with synthetic external commands in a root user namespace."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile

SOURCE = Path('/source')
assert os.geteuid() == 0 and not Path('/srv').exists()

STUB = r'''#!/usr/bin/python3
import json, os, pathlib, shutil, signal, sys
root = pathlib.Path(os.environ['FIXTURE_ROOT'])
mode = os.environ['FIXTURE_MODE']
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
def once(key):
    marker = root / key
    if marker.exists(): return False
    marker.touch()
    return True
current = root / 'current'
if name == 'sleep': sys.exit(0)
if name == 'systemctl': sys.exit(0)
if name == 'nginx':
    if '-T' in args:
        if mode == 'interrupt' and once('interrupted'):
            os.kill(os.getppid(), signal.SIGTERM)
        for item in ['http-maps', 'server-policy']:
            print(f'# configuration file {root}/snippets/avasan.org-{item}.conf:')
    if '-t' in args and mode == 'nginx-failure' and current.resolve().name == 'candidate' and once('nginx-failed'):
        sys.exit(1)
    sys.exit(0)
if name == 'install':
    if mode == 'second-snippet' and 'server-policy.conf' in args[-2] and once('install-failed'):
        sys.exit(1)
    os.execv('/usr/bin/install', ['install', *args])
if name == 'cp':
    if mode == 'restore-failure' and '.deployment-recovery/avasan-' in args[-2]:
        sys.exit(1)
    os.execv('/usr/bin/cp', ['cp', *args])
if name == 'curl':
    candidate = current.resolve().name == 'candidate'
    if candidate and mode in ['bad-health', 'restore-failure']: sys.exit(22)
    if candidate and mode == 'ipv6-failure' and '[::1]' in args[args.index('--resolve') + 1]: sys.exit(22)
    url = next(x for x in args if x.startswith('https://'))
    output = pathlib.Path(args[args.index('--output') + 1])
    if url.endswith('/release.json'):
        output.write_bytes((current / 'front-end/.output/public/release.json').read_bytes())
    elif url.endswith('/__avasan-deployment-probe-missing'):
        output.write_text('Page not found'); print('404', end='')
    else:
        output.write_text('Synthetic homepage')
        pathlib.Path(args[args.index('--dump-header') + 1]).write_text('Cross-Origin-Opener-Policy: same-origin\nCross-Origin-Resource-Policy: same-origin\n')
    with (root / 'probe-addresses').open('a') as f:
        f.write(args[args.index('--resolve') + 1] + '\n')
    sys.exit(0)
raise SystemExit('Unknown fixture command')
'''


def run(args, cwd=None, env=None):
    return subprocess.run(args, cwd=cwd, env=env, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def setup(root):
    candidate = root / 'releases/candidate'
    previous = root / 'releases/previous'
    candidate.mkdir(parents=True)
    for folder in ['scripts', 'deploy']:
        shutil.copytree(SOURCE / folder, candidate / folder)
    shutil.copyfile(SOURCE / 'package.json', candidate / 'package.json')
    (candidate / '.gitignore').write_text('front-end/\n.avasan-static-release.json\n.avasan-static-artifact.json\n')
    run(['git', 'init', '-b', 'main', str(candidate)])
    run(['git', 'config', 'user.name', 'Synthetic acceptance'], candidate)
    run(['git', 'config', 'user.email', 'fixture@example.invalid'], candidate)
    run(['git', 'add', '.'], candidate)
    run(['git', 'commit', '-m', 'Synthetic promotion fixture'], candidate)
    run(['git', 'remote', 'add', 'origin', 'git@github.com:anderson-webops/avasan.org.git'], candidate)
    run(['git', 'update-ref', 'refs/remotes/origin/main', 'HEAD'], candidate)
    version = json.loads((candidate / 'package.json').read_text())['version']
    run(['git', 'tag', '-a', f'v{version}', '-m', 'Synthetic fixture only'], candidate)
    commit = run(['git', 'rev-parse', 'HEAD'], candidate).stdout.strip()
    public = candidate / 'front-end/.output/public'
    public.mkdir(parents=True)
    for name in ['index.html', '200.html', '404.html', 'favicon.svg', 'robots.txt']:
        (public / name).write_text('Synthetic ' + name)
    (public / 'release.json').write_text(json.dumps({'revision': commit, 'version': version}) + '\n')
    run(['/runtime/node', str(candidate / 'scripts/static-artifact.mjs'), 'create', str(candidate)])
    old_public = previous / 'front-end/.output/public'
    shutil.copytree(public, old_public)
    (old_public / 'release.json').write_text(json.dumps({'revision': 'b' * 40, 'version': '1.2.9'}) + '\n')
    (root / 'current').symlink_to(previous)
    snippets = root / 'snippets'
    snippets.mkdir()
    for name in ['http-maps', 'server-policy']:
        target = snippets / f'avasan.org-{name}.conf'
        target.write_text('Previous synthetic ' + name)
        target.chmod(0o640)
    shim = root / 'shim'
    shim.mkdir()
    (shim / 'node').symlink_to('/runtime/node')
    for name in ['nginx', 'systemctl', 'curl', 'sleep', 'install', 'cp']:
        (shim / name).write_text(STUB)
        (shim / name).chmod(0o755)
    recovery = root / '.deployment-recovery'
    recovery.mkdir(mode=0o700)
    return candidate, previous, snippets, recovery, shim


def snapshot(snippets):
    return {p.name: (p.read_bytes(), stat.S_IMODE(p.stat().st_mode), p.stat().st_uid, p.stat().st_gid)
            for p in snippets.iterdir()}


for mode in ['success', 'bad-health', 'ipv6-failure', 'second-snippet', 'interrupt', 'nginx-failure',
             'restore-failure', 'lock-contention', 'invalid-current', 'tampered-artifact']:
    with tempfile.TemporaryDirectory(prefix='avasan-promotion-') as directory:
        root = Path(directory)
        candidate, previous, snippets, recovery, shim = setup(root)
        before = snapshot(snippets)
        env = {**os.environ, 'NODE_BIN_DIR': str(shim), 'RELEASE_ROOT': str(root / 'releases'),
               'CURRENT_LINK': str(root / 'current'), 'NGINX_SNIPPET_ROOT': str(snippets),
               'FIXTURE_ROOT': str(root), 'FIXTURE_MODE': mode}
        held = None
        if mode == 'lock-contention':
            held = (recovery / 'promotion.lock').open('w')
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if mode == 'invalid-current':
            (root / 'current').unlink()
            (root / 'current').mkdir()
        if mode == 'tampered-artifact':
            (candidate / 'front-end/.output/public/favicon.svg').write_text('tampered')
        try:
            result = subprocess.run(['bash', str(candidate / 'deploy/direct/promote-static-release.sh'), str(candidate)],
                                    env=env, capture_output=True, text=True, timeout=15)
        finally:
            if held:
                held.close()
        evidence = result.stdout + result.stderr
        assert (result.returncode == 0) == (mode == 'success'), (mode, evidence)
        if mode != 'invalid-current':
            assert (root / 'current').resolve() == (candidate if mode == 'success' else previous), (mode, evidence)
        if mode not in ['success', 'restore-failure']:
            assert snapshot(snippets) == before, (mode, 'previous snippet bytes or metadata changed', evidence)
        backups = list(recovery.glob('avasan-*'))
        if mode == 'restore-failure':
            assert len(backups) == 1 and 'protected backups retained' in evidence, evidence
            assert stat.S_IMODE(backups[0].stat().st_mode) == 0o700
            for name in ['http-maps', 'server-policy']:
                assert (backups[0] / f'{name}.conf').read_bytes() == before[f'avasan.org-{name}.conf'][0]
        else:
            assert not backups, (mode, 'disposable backups remain', evidence)
        if mode == 'success':
            for name in ['http-maps', 'server-policy']:
                assert (snippets / f'avasan.org-{name}.conf').read_bytes() == (candidate / f'deploy/nginx/{name}.conf').read_bytes()
            addresses = (root / 'probe-addresses').read_text()
            assert 'avasan.org:443:127.0.0.1' in addresses and 'avasan.org:443:[::1]' in addresses
        if mode == 'interrupt':
            assert result.returncode == 143 and (root / 'interrupted').exists(), evidence
        print(json.dumps({'promotionRecovery': mode, 'result': 'passed'}), flush=True)
