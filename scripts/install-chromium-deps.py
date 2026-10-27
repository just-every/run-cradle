#!/usr/bin/env python3
"""Bound Chromium library installation; called only after a real launch fails."""
import os
from pathlib import Path
import re
import subprocess
import time


def main():
    archives = Path(os.environ['APT_ARCHIVES'])
    archives.mkdir(parents=True, exist_ok=True)
    # Ubuntu-signed archives only; preserve suites, components and Signed-By.
    sources = Path('/etc/apt/sources.list.d/ubuntu.sources')
    original = sources.read_text()
    config = archives.parent / 'apt.conf'
    config.write_text(
        f'Dir::Cache::archives "{archives}";\n'
        'APT::Keep-Downloaded-Packages "true";\n'
        'APT::Update::Error-Mode "any";\n'
        'Acquire::Retries "2";\n'
        'Acquire::http::Timeout "30";\n'
        'Acquire::https::Timeout "30";\n'
    )
    environment = {**os.environ, 'APT_CONFIG': str(config)}
    started = time.monotonic()
    mirrors = (
        'http://azure.archive.ubuntu.com/ubuntu',
        'http://mirrors.edge.kernel.org/ubuntu',
        'http://us-east-1.ec2.archive.ubuntu.com/ubuntu',
    )
    try:
        for attempt, mirror in enumerate(mirrors, 1):
            sources.write_text(re.sub(r'^URIs:[^\n]*', f'URIs: {mirror}/', original, flags=re.M))
            print(f'Chromium apt: attempt {attempt}/3 (60s deadline; mirror {mirror})', flush=True)
            # timeout bounds the entire process group, including apt children.
            result = subprocess.run([
                'timeout', '--kill-after=5s', '60s', 'bash', '-ec',
                'dpkg --configure -a; ./node_modules/.bin/playwright install-deps chromium',
            ], env=environment, check=False)
            if result.returncode == 0:
                print(f'Chromium apt: complete (attempts={attempt} seconds={time.monotonic() - started:.0f})', flush=True)
                return 0
            print(f'Chromium apt: attempt {attempt}/3 failed (exit {result.returncode})', flush=True)
            if attempt < len(mirrors):
                time.sleep(attempt * 2)
        print('Chromium apt: failed after 3 bounded attempts', flush=True)
        return 1
    finally:
        sources.write_text(original)


if __name__ == '__main__':
    raise SystemExit(main())
