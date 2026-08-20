import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const filePaths = {
  index: path.join(projectRoot, 'public/index.html'),
  main: path.join(projectRoot, 'public/src/main.js'),
  api: path.join(projectRoot, 'public/src/api.js')
};

describe('Frontend structure requirements', () => {
  test('required frontend files exist', () => {
    for (const file of Object.values(filePaths)) {
      assert.equal(existsSync(file), true, `Missing required file: ${file}`);
    }
  });

  test('index.html loads main.js as ES module', () => {
    const html = readFileSync(filePaths.index, 'utf8');
    assert.match(html, /<script\s+type="module"\s+src="\/src\/main\.js"><\/script>/i);
  });

  test('main.js contains centralized state object and single handler declarations', () => {
    const mainJs = readFileSync(filePaths.main, 'utf8');
    assert.match(mainJs, /const\s+state\s*=\s*\{\s*subject:\s*null,\s*method:\s*null,\s*question:\s*''/s);
    assert.equal((mainJs.match(/function\s+chooseSubject\s*\(/g) || []).length, 1);
    assert.equal((mainJs.match(/function\s+chooseMethod\s*\(/g) || []).length, 1);
    assert.equal((mainJs.match(/function\s+solve\s*\(/g) || []).length, 1);
    assert.equal((mainJs.match(/function\s+saveQuestion\s*\(/g) || []).length, 1);
    assert.doesNotMatch(mainJs, /window\.solve|onclick=|inline onclick/i);
  });

  test('ES module uses addEventListener without global solve function', () => {
    const mainJs = readFileSync(filePaths.main, 'utf8');
    assert.match(mainJs, /addEventListener\s*\(/i);
    assert.doesNotMatch(mainJs, /window\s*\.\s*solve|window\.solve/);
    assert.doesNotMatch(mainJs, /window\s*\.|onclick\s*=/i);
  });

  test('api.js exists and is a module helper file', () => {
    const apiJs = readFileSync(filePaths.api, 'utf8');
    assert.match(apiJs, /export\s+function|export\s+const|export\s+default/i);
  });
});
