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
  api: path.join(projectRoot, 'public/src/api.js'),
  manifest: path.join(projectRoot, 'public/manifest.webmanifest'),
  serviceWorker: path.join(projectRoot, 'public/service-worker.js'),
  icon192: path.join(projectRoot, 'public/icons/app-icon-192.png'),
  icon512: path.join(projectRoot, 'public/icons/app-icon-512.png')
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

  test('installable app files and controls are connected', () => {
    const html = readFileSync(filePaths.index, 'utf8');
    const mainJs = readFileSync(filePaths.main, 'utf8');
    const manifest = JSON.parse(readFileSync(filePaths.manifest, 'utf8'));

    assert.match(html, /rel="manifest"\s+href="\/manifest\.webmanifest"/i);
    assert.match(html, /id="install-button"/i);
    assert.match(mainJs, /beforeinstallprompt/);
    assert.match(mainJs, /navigator\.serviceWorker\.register\('\/service-worker\.js'\)/);
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.icons.length >= 2, true);
  });

  test('AI drawing button provides subject-specific visual generators', () => {
    const html = readFileSync(filePaths.index, 'utf8');
    const mainJs = readFileSync(filePaths.main, 'utf8');

    assert.match(html, /id="ai-draw-button"/i);
    assert.match(html, /id="visual-result"/i);
    assert.match(mainJs, /function\s+generateVisual\s*\(/);
    assert.match(mainJs, /function\s+createCircuitVisual\s*\(/);
    assert.match(mainJs, /function\s+createMathVisual\s*\(/);
    assert.match(mainJs, /function\s+createChineseVisual\s*\(/);
    assert.match(mainJs, /aiDrawButton\.addEventListener\('click',\s*generateVisual\)/);
  });

  test('frontend uses canonical subject and method IDs', () => {
    const html = readFileSync(filePaths.index, 'utf8');
    const mainJs = readFileSync(filePaths.main, 'utf8');

    for (const subject of [
      'math',
      'chinese',
      'english',
      'basic_electricity',
      'electronics',
      'digital_logic',
      'programming',
      'microprocessor'
    ]) {
      assert.match(html, new RegExp(`data-subject="${subject}"`));
      assert.match(mainJs, new RegExp(`${subject}:`));
    }

    assert.match(mainJs, /subject:\s*state\.subject/);
    assert.match(mainJs, /method:\s*state\.method/);
    assert.doesNotMatch(mainJs, /mode:\s*methodLabels/);
  });

  test('frontend does not show controls without implemented behavior', () => {
    const html = readFileSync(filePaths.index, 'utf8');

    assert.doesNotMatch(
      html,
      /hint-button|practice-button|read-photo-button|dictionary-button/
    );
  });
});
