/*
 * Script to build the application.
 *
 * Hint: Don't use top level await here since this will cause the debugger to
 * hang on exit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { build, BuildOptions } from 'esbuild';

import pkg from '../package.json' with { type: 'json' };

/**
 * Defines if the the build should be a production build.
 */
const prod = process.env.NODE_ENV === 'production';

/**
 * Base dir of the project.
 */
const baseDir = path.join(import.meta.dirname, '..');

/*
 * create version information
 */
const commitId = execSync('git log --format="%H" -n1 || echo dev').toString().trim();
const version = execSync('git describe 2>/dev/null || true').toString().trim().replace(/^v/, '') || `${pkg.version}-${commitId}`;
console.log(`
Version: ${version}
Commit-ID: ${commitId}
`);

let building = false;
let buildCounter = 0;

async function runCommand (command: string, args: string[], cwd: string): Promise<void> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: ${command} ${args.join(' ')} (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
    });
  });
}

/**
 * Common build options.
 */
const buildOptions: BuildOptions = {
  entryPoints: [
    './src/index.ts',
  ],
  outbase: './src',
  platform: 'neutral',
  external: [],
  sourcemap: true,
  target: 'node22',
  treeShaking: true,
  metafile: true,
  bundle: true,
};

/**
 * Do the build.
 */
async function doBuild (): Promise<boolean> {
  building = true;

  process.stdout.write(`Doing ${prod ? 'production' : 'development'} build #${++buildCounter} ... `);
  const startTime = Date.now();

  /** return success state */
  let success = true;

  const [ esmResult, cjsResult, browserResult, browserMinResult ] = await Promise.all([
    // ESM build
    build({
      ...buildOptions,
      outdir: './dist/esm',
      format: 'esm',
    }),

    // CJS build
    build({
      ...buildOptions,
      outdir: './dist/cjs',
      format: 'cjs',
      outExtension: {
        '.js': '.cjs',
      },
    }),

    // Browser build
    build({
      ...buildOptions,
      outfile: './dist/browser/crytemplate.js',
      format: 'iife',
      platform: 'browser',
      globalName: 'cryTemplate',
      sourcemap: false,
    }),

    // Browser build (minified)
    build({
      ...buildOptions,
      outfile: './dist/browser/crytemplate.min.js',
      minify: true,
      format: 'iife',
      platform: 'browser',
      globalName: 'cryTemplate',
      sourcemap: false,
    }),

    // .d.ts generation
    runCommand('npm', [ 'exec', '--', 'tsc', '-p', 'tsconfig.types.json' ], baseDir)
      .catch(() => { // catch errors here to not fail the whole build
        success = false;
      }),
  ]);

  // write results metafiles
  await Promise.all([
    fs.promises.writeFile(path.join(baseDir, 'dist', 'metaEsm.json'), JSON.stringify(esmResult.metafile, undefined, 2)),
    fs.promises.writeFile(path.join(baseDir, 'dist', 'metaCjs.json'), JSON.stringify(cjsResult.metafile, undefined, 2)),
    fs.promises.writeFile(path.join(baseDir, 'dist', 'metaBrowser.json'), JSON.stringify(browserResult.metafile, undefined, 2)),
    fs.promises.writeFile(path.join(baseDir, 'dist', 'metaBrowserMin.json'), JSON.stringify(browserMinResult.metafile, undefined, 2)),
  ]);

  const duration = Date.now() - startTime;
  process.stdout.write(`Build done in ${(duration / 1000).toFixed(2)}s\n`);

  building = false;

  return success;
}

/**
 * Main function to init the process
 */
async function main (): Promise<void> {

  // run a normal build
  let success = await doBuild();

  // Watch for changes?
  if (process.argv.includes('--watch')) {
    let debounce: NodeJS.Timeout | null = null;

    console.log('Watching for src changes ...');

    const watcher = fs.watch('src', { recursive: true }, (_event, _filename) => {
      if (debounce) {
        clearTimeout(debounce);
      }

      // run build debounced
      debounce = setTimeout(async () => {
        debounce = null;

        // do nothing if already building
        if (building) return;

        success = await doBuild();
      }, 2000);
    });

    process.on('SIGINT', () => {
      console.log('Stop watching for changes');
      watcher.close();
    });

  }

  // exit with proper code
  process.exit(success ? 0 : 1);
}

void main();
