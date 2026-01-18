/*
 * Helper script to read coverage-summary.json and write a nice markdown summary
 * into the GitHub Actions job summary (if running in GH Actions).
 *
 * Usage: tsx scripts/coverage-summary.ts
 */
import fs from 'node:fs';
import path from 'node:path';

interface Metric {
  total: number;
  covered: number;
  pct: number;
}

interface CoverageTotals {
  lines: Metric;
  statements: Metric;
  functions: Metric;
  branches: Metric;
}

// the c8 summary json has one key "total" and then entries per file path
type CoverageSummary = { total: CoverageTotals } & Record<string, CoverageTotals>;

function toPct (n: number): string {
  // keep one decimal
  return `${n.toFixed(2)}%`;
}

function escapeHtml (s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function main (): void {
  const covPath = path.join(process.cwd(), 'coverage');
  const jsonPath = path.join(covPath, 'coverage-summary.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('coverage-summary.json not found. Did tests run with coverage?');
    process.exit(0); // don't fail CI if missing
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CoverageSummary;
  const t = data.total;

  const md = [
    '## Coverage Report',
    '',
    `* Lines: ${toPct(t.lines.pct)} (${t.lines.covered}/${t.lines.total})`,
    `* Statements: ${toPct(t.statements.pct)} (${t.statements.covered}/${t.statements.total})`,
    `* Functions: ${toPct(t.functions.pct)} (${t.functions.covered}/${t.functions.total})`,
    `* Branches: ${toPct(t.branches.pct)} (${t.branches.covered}/${t.branches.total})`,
    '',
  ];

  // Build details section with per-file coverage table
  const rows: string[] = [];
  const fileEntries = Object.entries(data)
    .filter(([ k, v ]) => k !== 'total' && v && typeof v === 'object' && 'lines' in v)
    .sort(([ _a, aC ], [ _b, bC ]) => bC.statements.pct - aC.statements.pct);

  for (const [ filePath, m ] of fileEntries) {
    const rel = escapeHtml(path.relative(process.cwd(), filePath));
    rows.push(`| \`${rel}\` | ${toPct(m.lines.pct)} (${m.lines.covered}/${m.lines.total}) | ${toPct(m.statements.pct)} (${m.statements.covered}/${m.statements.total}) | ${toPct(m.functions.pct)} (${m.functions.covered}/${m.functions.total}) | ${toPct(m.branches.pct)} (${m.branches.covered}/${m.branches.total}) |`);
  }

  md.push(
    '<details>',
    '<summary>Per-file Coverage</summary>',
    '',
    '| File | Lines | Statements | Functions | Branches |',
    '| ---- | ----- | ---------- | --------- | -------- |',
    ...rows,
    '',
    '</details>',
    '',
  );

  const isGhActions = !!process.env.GITHUB_STEP_SUMMARY;

  const summaryFile = isGhActions ? process.env.GITHUB_STEP_SUMMARY : path.join(covPath, 'coverage-summary.md');
  if (summaryFile) {
    try {
      if (isGhActions) {
        fs.appendFileSync(summaryFile, md.join('\n'));
        console.log('Coverage summary written to GitHub Actions job summary.');
      } else {
        fs.writeFileSync(summaryFile, md.join('\n'));
        console.log(`Coverage summary written to ${summaryFile}.`);
      }
    } catch (_e) {
      console.log(md);
    }
  } else {
    // local and no file: show markdown-like text and also print c8 text-summary already visible
    console.log(md);
  }
}

main();
