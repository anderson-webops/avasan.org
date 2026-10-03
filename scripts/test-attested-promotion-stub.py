#!/usr/bin/python3
"""Disposable command stand-ins for the isolated Avasan promotion fixture."""

import os
from pathlib import Path
import sys


name = Path(sys.argv[0]).name
arguments = sys.argv[1:]
base = Path('/srv/avasan.org')
mode = os.environ.get('FIXTURE_MODE', 'success')

if name == 'gh':
    if arguments[:2] != ['attestation', 'verify'] or '--deny-self-hosted-runners' not in arguments:
        raise SystemExit(2)
    (base / 'gh-called').write_text('attestation verify')
elif name == 'nginx':
    if '-T' in arguments:
        for snippet in ['http-maps', 'server-policy']:
            print(f'# configuration file /etc/nginx/snippets/avasan.org-{snippet}.conf:')
    elif '-t' not in arguments:
        raise SystemExit(2)
elif name == 'systemctl':
    if arguments != ['reload', 'nginx']:
        raise SystemExit(2)
elif name == 'sleep':
    pass
elif name == 'curl':
    current = (base / 'current').resolve()
    if mode in ('bad-health', 'bad-rollback-headers') and current.name.startswith('a' * 40):
        raise SystemExit(22)
    address = arguments[arguments.index('--resolve') + 1]
    with (base / 'probes').open('a') as output:
        output.write(f'{current.name} {address}\n')
    url = next(value for value in arguments if value.startswith('https://'))
    output = Path(arguments[arguments.index('--output') + 1])
    if url.endswith('/release.json'):
        output.write_bytes((current / 'front-end/.output/public/release.json').read_bytes())
    elif url.endswith('/__avasan-deployment-probe-missing'):
        output.write_bytes((current / 'front-end/.output/public/404.html').read_bytes())
        print('404', end='')
    else:
        output.write_text('Synthetic homepage')
        headers = Path(arguments[arguments.index('--dump-header') + 1])
        if mode == 'bad-rollback-headers' and current.name.startswith('legacy-v1.2.12-'):
            headers.write_text('Content-Type: text/html\n')
        else:
            policy = Path('/etc/nginx/snippets/avasan.org-server-policy.conf').read_bytes()
            values = ['Content-Type: text/html']
            if b'Cross-Origin-Opener-Policy "same-origin" always' in policy:
                values.append('Cross-Origin-Opener-Policy: same-origin')
            if b'Cross-Origin-Resource-Policy "same-origin" always' in policy:
                values.append('Cross-Origin-Resource-Policy: same-origin')
            if b'X-Content-Type-Options "nosniff" always' in policy:
                values.append('X-Content-Type-Options: nosniff')
            headers.write_text('\n'.join(values) + '\n')
        print('200', end='')
else:
    raise SystemExit(2)
