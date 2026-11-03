const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

// Most modules are only tested through stubs or source checks; a syntax error (e.g. a redeclared name) would still
// stop the page from booting. Parse every page module as an ES module.
test('every page module parses', () => {
  const dir = join(__dirname, '..', 'js');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(join(dir, file)) });
    assert.equal(r.status, 0, `${file}: ${r.stderr.toString().split('\n').find((l) => l.includes('Error')) || ''}`);
  }
});
