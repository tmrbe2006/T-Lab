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
    assert.match(content, /start-tlab-pilot\.bat/);
    assert.match(content, /windows-local-pilot\.ps1/);
    assert.match(content, /T-Lab-Pilot-Sandbox/);
    assert.match(content, /TLAB_ENABLE_LEGACY_API=false/);
    assert.match(content, /dist\\index\.html/);
    assert.doesNotMatch(content, /^Type:\s*filesandordirs; Name: "\{app\}\\dist"/m);
    assert.match(content, /TLAB_ENABLE_UNSAFE_BULK_IMPORT=false/);
  });
}

test('server does not silently use development mode when static-dist is requested', async () => {
  const content = await readFile('server.ts', 'utf8');
  assert.match(content, /const staticRequested = process\.argv\.includes\('--static-dist'\)/);
  assert.match(content, /if \(staticRequested && !fs\.existsSync\(distIndexHtml\)\)/);
  assert.doesNotMatch(content, /!fs\.existsSync\(srcMainPath\)/);
});

test('safe local sandbox startup is the only UI launch path and requires compiled assets', async () => {
  const launcher = await readFile('scripts/windows-local-pilot.ps1', 'utf8');
  const check = await readFile('scripts/check-local-sandbox.ts', 'utf8');
  const initializer = await readFile('scripts/init-sandbox.ts', 'utf8');
  assert.match(launcher, /--static-dist/);
  assert.match(launcher, /check-local-sandbox\.ts/);
  assert.match(check, /_(test\|demo)/);
  assert.match(check, /Legacy|legacy|TLAB_ENABLE_LEGACY_API/);
  assert.match(initializer, /CONFIRM_EMPTY_TEST_DATABASE/);
  assert.match(initializer, /NOT EMPTY/);
});
