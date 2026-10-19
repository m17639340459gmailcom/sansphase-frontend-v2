import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildOptions, generatedRoot } from './build-config.ts';

export { generatedRoot };
export const buildOptions = createBuildOptions();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build(buildOptions);
}
