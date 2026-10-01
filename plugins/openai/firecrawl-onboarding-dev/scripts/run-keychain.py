"""Launch the development server with its API key held only in process memory."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

worktree = Path(os.environ.get('FIRECRAWL_MCP_WORKTREE', Path(__file__).resolve().parents[4]))
node = shutil.which('node') or '/opt/homebrew/bin/node'
if not (worktree / 'dist/index.js').is_file():
    print('Firecrawl: build the MCP worktree and reinstall the local plugin.', file=sys.stderr)
    sys.exit(1)

command = ['/usr/bin/security', 'find-generic-password', '-s', 'FIRECRAWL_API_KEY']
account = os.environ.get('FIRECRAWL_KEYCHAIN_ACCOUNT')
if account:
    command.extend(['-a', account])
command.append('-w')
try:
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=60)
except (subprocess.SubprocessError, OSError):
    print('Firecrawl: could not read the API key from macOS Keychain.', file=sys.stderr)
    sys.exit(1)
key = result.stdout.strip()
if not key.startswith('fc-') or len(key) < 12:
    print('Firecrawl: the Keychain item does not contain a valid API key.', file=sys.stderr)
    sys.exit(1)

env = os.environ.copy()
for name in ('FIRECRAWL_API_URL', 'FIRECRAWL_OAUTH_TOKEN', 'SSE_LOCAL',
             'FASTMCP_ENDPOINT', 'FIRECRAWL_MCP_PROFILE'):
    env.pop(name, None)
env.update(FIRECRAWL_API_KEY=key, HTTP_STREAMABLE_SERVER='false',
           CLOUD_SERVICE='false', FIRECRAWL_MCP_SEARCH_ENABLED='false')
os.chdir(worktree)
os.execve(node, [node, str(worktree / 'dist/index.js')], env)
