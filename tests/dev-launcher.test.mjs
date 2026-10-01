import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const launcher = fileURLToPath(new URL('../plugins/openai/firecrawl-usage-dev/scripts/run-keychain.py', import.meta.url));

test('development launcher resolves relative paths and supports Intel Node without exposing credentials', () => {
  execFileSync('python3', ['-c', `
import os, runpy, subprocess, tempfile
from pathlib import Path
from unittest.mock import patch
with tempfile.TemporaryDirectory() as root:
    worktree = (Path(root) / 'relative').resolve()
    (worktree / 'dist').mkdir(parents=True)
    (worktree / 'dist/index.js').write_text('')
    original = Path.is_file
    def exists(path):
        return str(path) == '/usr/local/bin/node' if str(path) in ['/opt/homebrew/bin/node','/usr/local/bin/node'] else original(path)
    with patch.dict(os.environ, {'FIRECRAWL_MCP_WORKTREE':'relative', 'FIRECRAWL_KEYCHAIN_ACCOUNT':'selected-account'}), patch('shutil.which', return_value=None), patch.object(Path,'is_file',exists), patch('os.access',return_value=True), patch('subprocess.run',return_value=subprocess.CompletedProcess([],0,stdout='fc-synthetic-launcher-test',stderr='')) as security, patch('os.execve') as execute:
        os.chdir(root)
        runpy.run_path(${JSON.stringify(launcher)})
        assert execute.call_args.args[0] == '/usr/local/bin/node'
        assert execute.call_args.args[1][1] == str(worktree / 'dist/index.js')
        assert os.getcwd() == str(worktree)
        assert '-a' in security.call_args.args[0]
        assert 'selected-account' in security.call_args.args[0]
`], {stdio:'pipe'});
});

test('development launcher gives a controlled error when Node cannot be found', () => {
  execFileSync('python3', ['-c', `
import io, runpy
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch
with patch('shutil.which',return_value=None), patch.object(Path,'is_file',return_value=False), redirect_stderr(io.StringIO()) as error:
    try: runpy.run_path(${JSON.stringify(launcher)})
    except SystemExit as exit: assert exit.code == 1
    else: raise AssertionError('missing Node was not rejected')
    assert 'install Node.js 22' in error.getvalue()
`], {stdio:'pipe'});
});
