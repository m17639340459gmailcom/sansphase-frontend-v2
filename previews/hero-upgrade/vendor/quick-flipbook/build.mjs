// Local reproducible bundling only. No upstream installation or build scripts run.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [resolve(sourceRoot, 'src/FlipBook.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: resolve(sourceRoot, 'index.js'),
  write: false,
  external: ['three', 'three/examples/jsm/utils/BufferGeometryUtils.js'],
  alias: {
    'three.modifiers/src/core/VertexProxy': resolve(sourceRoot, 'third-party/three-modifiers/src/core/VertexProxy.ts'),
    'three.modifiers': resolve(sourceRoot, 'third-party/three-modifiers/src/index.ts'),
  },
  banner: { js: '/* quick_flipbook 1.1.3 (BSD-2-Clause) + three.modifiers 2.5.7 (BSD-3-Clause). See adjacent LICENSE and UPSTREAM.md. */' },
  logLevel: 'warning',
});
// esbuild retains upstream comment indentation on otherwise blank lines.
for (const output of result.outputFiles) await writeFile(output.path, output.text.replace(/[ \t]+$/gm, ''));
