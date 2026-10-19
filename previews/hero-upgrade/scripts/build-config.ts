// Shared by the live preview and release inspection build. esbuild owns chunk
// splitting, minification and content hashes; the adapter only records outputs.
import type { BuildOptions, Metafile } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const generatedRoot = resolve(sourceRoot, '../../outputs/hero-upgrade');
export interface BuildManifest { version: 1; script: string; stylesheet: string; assets: string[] }

export function buildManifest(metafile: Metafile): BuildManifest {
  const outputs = Object.entries(metafile.outputs);
  const entry = outputs.find(([path, value]) => path.endsWith('.js') && value.entryPoint?.replaceAll('\\', '/').endsWith('src/main.ts'));
  if (!entry || !entry[1].cssBundle) throw new Error('Missing frontend entry or stylesheet');
  return {
    version: 1,
    script: `/build/${basename(entry[0])}`,
    stylesheet: `/build/${basename(entry[1].cssBundle)}`,
    assets: outputs.filter(([path]) => !path.endsWith('.map')).map(([path]) => `/build/${basename(path)}`),
  };
}

export function applyBuildManifest(html: string, manifest: BuildManifest): string {
  return html.replace('href="/build/main.css"', `href="${manifest.stylesheet}"`)
    .replace('src="/build/main.js"', `src="${manifest.script}"`);
}

export function createBuildOptions({ development = false, artifacts = true } = {}): BuildOptions {
  return {
    absWorkingDir: sourceRoot,
    entryPoints: [resolve(sourceRoot, 'src/main.ts')], bundle: true,
    format: 'esm', splitting: true, target: 'es2022',
    outdir: resolve(generatedRoot, 'build'), publicPath: '/build',
    entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]', assetNames: '[name]-[hash]',
    loader: { '.woff2': 'file', '.woff': 'file' },
    minify: !development, sourcemap: development ? 'external' : false,
    metafile: true, legalComments: 'eof', logLevel: 'info',
    plugins: artifacts ? [{ name: 'frontend-delivery-manifest', setup(builder) {
      builder.onLoad({ filter: /[\\/]src[\\/]main\.ts$/ }, async args => ({
        contents: await readFile(args.path, 'utf8'), loader: 'ts', resolveDir: dirname(args.path),
        watchFiles: [args.path, resolve(sourceRoot, 'www/index.html'), resolve(sourceRoot, 'www/style.css'), resolve(sourceRoot, 'www/third-party-notices.txt')],
      }));
      builder.onEnd(async result => {
        if (result.errors.length || !result.metafile) return;
        const manifest = buildManifest(result.metafile);
        await mkdir(generatedRoot, { recursive: true });
        const template = await readFile(resolve(sourceRoot, 'www/index.html'), 'utf8');
        await Promise.all([
          writeFile(resolve(generatedRoot, 'index.html'), applyBuildManifest(template, manifest)),
          writeFile(resolve(generatedRoot, 'style.css'), await readFile(resolve(sourceRoot, 'www/style.css'))),
          writeFile(resolve(generatedRoot, 'third-party-notices.txt'), await readFile(resolve(sourceRoot, 'www/third-party-notices.txt'))),
          writeFile(resolve(generatedRoot, 'build-manifest.json'), JSON.stringify(manifest, null, 2)),
          writeFile(resolve(generatedRoot, 'build-metafile.json'), JSON.stringify(result.metafile, null, 2)),
        ]);
      });
    } }] : [],
  };
}
