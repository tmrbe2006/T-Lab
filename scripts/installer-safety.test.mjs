import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const filename of ['tlab-setup.iss', 'public/tlab-setup.iss']) {
  test(filename + ' never runs destructive operations during installation', async () => {
    const content = await readFile(filename, 'utf8');
    assert.doesNotMatch(content, /taskkill\s+\/F\s+\/IM\s+node\.exe/i);
    assert.doesNotMatch(content, /Permissions:\s*everyone-full/i);
    assert.doesNotMatch(content, /WizardIsTaskSelected\('importdb_(?:full|clean)'\)/i);
    assert.doesNotMatch(content, /MYSQL_AUTO_SYNC=true/);
    assert.doesNotMatch(content, /NODE_ENV=development/);
    assert.match(content, /if not FileExists\(ExpandConstant\('\{app\}\\\.env'\)\) then/);
    assert.match(content, /TLAB_ADMIN_PASSWORD=/);
    assert.match(content, /--static-dist/);
    assert.match(content, /TLAB_ENABLE_UNSAFE_BULK_IMPORT=false/);
  });
}

test('server does not silently use development mode when static-dist is requested', async () => {
  const content = await readFile('server.ts', 'utf8');
  assert.match(content, /const staticRequested = process\.argv\.includes\('--static-dist'\)/);
  assert.match(content, /if \(staticRequested && !fs\.existsSync\(distIndexHtml\)\)/);
  assert.doesNotMatch(content, /!fs\.existsSync\(srcMainPath\)/);
});
