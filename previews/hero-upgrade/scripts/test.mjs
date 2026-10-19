import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testPath = resolve(sourceRoot, '../../outputs/hero-upgrade/tests/preview.test.cjs');
await build({ entryPoints: [resolve(sourceRoot, 'tests/preview.test.ts')], outfile: testPath, bundle: true, platform: 'node', format: 'cjs', target: 'node24' });
const suites = ['theme', 'hero-content', 'hero-scene-ui', 'ambient-lifecycle', 'directions', 'showcase', 'facts', 'manifesto', 'scene-control', 'scene-lifecycle', 'scene-shapes', 'reader-focus', 'magnetic', 'home-sections', 'home-closing', 'header', 'page-transition', 'marquee', 'reader-navigation', 'inner-pages', 'page-experience', 'reader-experience', 'palette-modal', 'article-images', 'journal-page', 'route-anchor', 'integration-server', 'integration-account', 'integration-content', 'integration-directories', 'integration-journal', 'integration-runtime', 'integration-empty'];
const result = spawnSync(process.execPath, ['--test', testPath, ...[...suites, 'integration-community', 'navigation-state', 'library-contract', 'library-page', 'library-book', 'library-book-viewer', 'microtype', 'catalog-contract', 'catalog-page', 'loading-architecture', 'demo-content', 'catalog-demo', 'library-demo'].map(name => resolve(sourceRoot, `tests/${name}.test.mjs`))], { cwd: sourceRoot, stdio: 'inherit', env: { ...process.env } });
process.exitCode = result.status ?? 1;
