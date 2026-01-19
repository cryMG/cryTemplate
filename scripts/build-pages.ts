/*
 * Script to build the pages (website).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const baseDir = path.join(import.meta.dirname, '..');
const pagesSrcDir = path.join(baseDir, 'pages');
const outDir = path.join(baseDir, 'dist-pages');

async function copyDir (srcDir: string, dstDir: string): Promise<void> {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);

    // Partials are build-time only and should not be shipped.
    if (entry.isDirectory() && entry.name === 'partials') {
      return;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
      return;
    }

    if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath);
    }
  }));
}

function computeRootPrefix (outFilePath: string): string {
  // outFilePath is absolute within dist-pages.
  const rel = path.relative(outDir, path.dirname(outFilePath));
  if (!rel || rel === '.') return './';

  const depth = rel.split(path.sep).filter(Boolean).length;
  return '../'.repeat(depth);
}

async function listHtmlFiles (dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listHtmlFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      files.push(full);
    }
  }

  return files;
}

async function injectPartials (): Promise<void> {
  const headTplPath = path.join(pagesSrcDir, 'partials', 'head.html');
  const headerTplPath = path.join(pagesSrcDir, 'partials', 'header.html');
  const footerTplPath = path.join(pagesSrcDir, 'partials', 'footer.html');

  const [ headTplRaw, headerTplRaw, footerTplRaw ] = await Promise.all([
    fs.readFile(headTplPath, 'utf8'),
    fs.readFile(headerTplPath, 'utf8'),
    fs.readFile(footerTplPath, 'utf8'),
  ]);

  const htmlFiles = await listHtmlFiles(outDir);
  await Promise.all(htmlFiles.map(async (filePath) => {
    const src = await fs.readFile(filePath, 'utf8');
    if (!src.includes('<!-- @partial:head -->') && !src.includes('<!-- @partial:header -->') && !src.includes('<!-- @partial:footer -->')) {
      return;
    }

    const rootPrefix = computeRootPrefix(filePath);
    const head = headTplRaw.replaceAll('__ROOT__', rootPrefix);
    const header = headerTplRaw.replaceAll('__ROOT__', rootPrefix);
    const footer = footerTplRaw.replaceAll('__ROOT__', rootPrefix);

    const out = src
      .replace('<!-- @partial:head -->', head.trim())
      .replace('<!-- @partial:header -->', header.trim())
      .replace('<!-- @partial:footer -->', footer.trim());

    await fs.writeFile(filePath, out);
  }));
}

async function main (): Promise<void> {
  // Clean output
  await fs.rm(outDir, { recursive: true, force: true });

  // Copy pages source
  await copyDir(pagesSrcDir, outDir);

  // Inject shared header/footer
  await injectPartials();

  // Copy the browser bundle built by `npm run build`
  const srcBundle = path.join(baseDir, 'dist', 'browser', 'crytemplate.min.js');
  const dstBundle = path.join(outDir, 'assets', 'crytemplate.min.js');
  await fs.mkdir(path.dirname(dstBundle), { recursive: true });
  await fs.copyFile(srcBundle, dstBundle);

  // Basic no-jekyll marker (keeps files/folders starting with underscore, if ever added)
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  console.log(`Pages build complete: ${path.relative(baseDir, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
