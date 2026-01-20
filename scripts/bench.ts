/*
 * Benchmark parsing/compiling templates.
 *
 * Notes:
 * - This is a micro-benchmark. Results vary by machine and Node.js version.
 * - "Parsing" means different things across template engines.
 *   For engines without a public parser, we benchmark their compile step.
 */

import { performance } from 'node:perf_hooks';

import { tplParse, tplRenderNodes } from '../src/template-parser.js';

type BenchmarkKind = 'parse' | 'render' | 'parse+render';

interface BenchmarkResult {
  kind: BenchmarkKind;
  scenario: string;
  iterations: number;
  totalMs: number;
  msPerOp: number;
  opsPerSec: number;
}

interface Scenario {
  name: string;
  template: string;
  data: Record<string, unknown>;
}

function parseArgs (argv: string[]): {
  iterations: number;
  warmup: number;
  uniqueTemplates: number;
  format: 'table' | 'md' | 'json';
  mode: 'all' | BenchmarkKind;
} {
  const out: {
    iterations: number;
    warmup: number;
    uniqueTemplates: number;
    format: 'table' | 'md' | 'json';
    mode: 'all' | BenchmarkKind;
  } = {
    iterations: 20_000,
    warmup: 2_000,
    uniqueTemplates: 128,
    format: 'table',
    mode: 'all',
  };

  for (const arg of argv) {
    const m = /^--(iterations|warmup|unique)=(\d+)$/.exec(arg);
    if (!m) continue;

    const value = Number.parseInt(m[2] ?? '', 10);
    if (!Number.isFinite(value) || value < 0) continue;

    if (m[1] === 'iterations') out.iterations = value;
    if (m[1] === 'warmup') out.warmup = value;
    if (m[1] === 'unique') out.uniqueTemplates = value;
  }

  // keep things sane
  out.uniqueTemplates = Math.max(1, Math.min(out.uniqueTemplates, 4096));
  out.warmup = Math.max(0, Math.min(out.warmup, 200_000));
  out.iterations = Math.max(1, Math.min(out.iterations, 2_000_000));

  for (const arg of argv) {
    const m = /^--format=(table|md|json)$/.exec(arg);
    if (!m) continue;
    out.format = m[1] as typeof out.format;
  }

  for (const arg of argv) {
    const m = /^--mode=(all|parse|render|parse\+render)$/.exec(arg);
    if (!m) continue;
    out.mode = m[1] as typeof out.mode;
  }

  return out;
}

function makeTemplateVariants (base: string, count: number): string[] {
  const variants: string[] = [];

  for (let i = 0; i < count; i++) {
    // Add a tiny per-variant comment so engines with internal string caches
    // cannot reuse previous parse results.
    variants.push(`${base}{#v:${i}#}`);
  }

  return variants;
}

function benchParse (scenario: string, templates: string[], iterations: number, warmup: number): BenchmarkResult {
  let sink = 0;
  for (let i = 0; i < warmup; i++) {
    sink += tplParse(templates[i % templates.length] ?? '').length;
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    sink += tplParse(templates[i % templates.length] ?? '').length;
  }
  const end = performance.now();

  if (sink === Number.NEGATIVE_INFINITY) {
    // Prevent DCE in case of overly aggressive optimizations.
    console.log('sink', sink);
  }

  const totalMs = end - start;
  const msPerOp = totalMs / iterations;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    kind: 'parse',
    scenario,
    iterations,
    totalMs,
    msPerOp,
    opsPerSec,
  };
}

function benchRender (
  scenario: string,
  parsed: { nodes: ReturnType<typeof tplParse>, data: Record<string, unknown> }[],
  iterations: number,
  warmup: number,
): BenchmarkResult {
  let sink = 0;

  for (let i = 0; i < warmup; i++) {
    const item = parsed[i % parsed.length];
    const out = tplRenderNodes(item?.nodes ?? [], [ item?.data ?? {} ]);
    sink += out.length;
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const item = parsed[i % parsed.length];
    const out = tplRenderNodes(item?.nodes ?? [], [ item?.data ?? {} ]);
    sink += out.length;
  }
  const end = performance.now();

  if (sink === Number.NEGATIVE_INFINITY) {
    console.log('sink', sink);
  }

  const totalMs = end - start;
  const msPerOp = totalMs / iterations;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    kind: 'render',
    scenario,
    iterations,
    totalMs,
    msPerOp,
    opsPerSec,
  };
}

function benchParseAndRender (
  scenario: string,
  templates: string[],
  data: Record<string, unknown>,
  iterations: number,
  warmup: number,
): BenchmarkResult {
  let sink = 0;

  for (let i = 0; i < warmup; i++) {
    const tpl = templates[i % templates.length] ?? '';
    const nodes = tplParse(tpl);
    sink += tplRenderNodes(nodes, [ data ]).length;
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const tpl = templates[i % templates.length] ?? '';
    const nodes = tplParse(tpl);
    sink += tplRenderNodes(nodes, [ data ]).length;
  }
  const end = performance.now();

  if (sink === Number.NEGATIVE_INFINITY) {
    console.log('sink', sink);
  }

  const totalMs = end - start;
  const msPerOp = totalMs / iterations;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    kind: 'parse+render',
    scenario,
    iterations,
    totalMs,
    msPerOp,
    opsPerSec,
  };
}

function main (): void {
  const args = parseArgs(process.argv.slice(2));

  if (process.execArgv.some((a) => a.startsWith('--inspect'))) {
    console.warn('Warning: Node inspector is enabled; benchmark results will be distorted.');
    console.warn('Tip: run in a normal terminal / unset NODE_OPTIONS.');
    console.warn('');
  }

  const scenarios: Scenario[] = [
    {
      name: 'small (interpolation + filter)',
      template: 'Hello {{ name | trim | upper }}!\n',
      data: {
        name: '  Alice  ',
      },
    },
    {
      name: 'medium (if + each + filters)',
      template: [
        '{% if user.admin %}Admin{% else %}User{% endif %}',
        '\n',
        '{% each item in items %}',
        '- {{ item.title | trim }} ({{ item.count || 0 }})',
        '{% endeach %}',
        '\n',
      ].join(''),
      data: {
        user: {
          admin: true,
        },
        items: [
          { title: '  Foo  ', count: 1 },
          { title: 'Bar', count: 2 },
          { title: ' Baz', count: 0 },
        ],
      },
    },
    {
      name: 'large (many interpolations)',
      template: Array.from({ length: 80 }, (_, i) => `Row ${i}: {{ user.name }} - {{ user.email }}\n`).join(''),
      data: {
        user: {
          name: 'Alice',
          email: 'alice@example.test',
        },
      },
    },
  ];

  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    const templates = makeTemplateVariants(scenario.template, args.uniqueTemplates);
    const parsed = templates.map((t) => ({ nodes: tplParse(t), data: scenario.data }));

    if (args.mode === 'all' || args.mode === 'parse') {
      results.push(benchParse(scenario.name, templates, args.iterations, args.warmup));
    }
    if (args.mode === 'all' || args.mode === 'render') {
      results.push(benchRender(scenario.name, parsed, args.iterations, args.warmup));
    }
    if (args.mode === 'all' || args.mode === 'parse+render') {
      results.push(benchParseAndRender(scenario.name, templates, scenario.data, args.iterations, args.warmup));
    }
  }

  if (args.format === 'json') {
    console.log(JSON.stringify({
      node: process.version,
      params: {
        iterations: args.iterations,
        warmup: args.warmup,
        uniqueTemplates: args.uniqueTemplates,
        mode: args.mode,
      },
      results: results.map((r) => ({
        kind: r.kind,
        scenario: r.scenario,
        iterations: r.iterations,
        totalMs: Number(r.totalMs.toFixed(2)),
        msPerOp: Number(r.msPerOp.toFixed(6)),
        opsPerSec: Number(r.opsPerSec.toFixed(0)),
      })),
    }));
    return;
  }

  if (args.format === 'md') {
    console.log('## cryTemplate benchmark');
    console.log('');
    console.log(`- Node: ${process.version}`);
    console.log(`- Params: iterations=${args.iterations}, warmup=${args.warmup}, uniqueTemplates=${args.uniqueTemplates}, mode=${args.mode}`);
    console.log('');
    console.log('| Kind | Scenario | Iterations | Total (ms) | ms/op | ops/sec |');
    console.log('| --- | --- | ---: | ---: | ---: | ---: |');

    for (const r of results) {
      const totalMs = Number(r.totalMs.toFixed(2));
      const msPerOp = Number(r.msPerOp.toFixed(6));
      const opsPerSec = Number(r.opsPerSec.toFixed(0));
      console.log(`| ${r.kind} | ${r.scenario} | ${r.iterations} | ${totalMs} | ${msPerOp} | ${opsPerSec} |`);
    }

    console.log('');
    console.log('Notes:');
    console.log('- Micro-benchmark results vary by machine and Node.js version.');
    console.log('- kind=parse: parsing/compiling only (tplParse).');
    console.log('- kind=render: rendering only (tplRenderNodes) on pre-parsed templates.');
    console.log('- kind=parse+render: parse+render in the hot loop.');
    return;
  }

  console.log('Template benchmark');
  console.log(`Node: ${process.version}`);
  console.log(`iterations=${args.iterations} warmup=${args.warmup} uniqueTemplates=${args.uniqueTemplates} mode=${args.mode}`);
  console.log('');

  console.table(
    results.map((r) => ({
      kind: r.kind,
      scenario: r.scenario,
      iterations: r.iterations,
      totalMs: Number(r.totalMs.toFixed(2)),
      msPerOp: Number(r.msPerOp.toFixed(6)),
      opsPerSec: Number(r.opsPerSec.toFixed(0)),
    })),
  );

  console.log('');
  console.log('Notes:');
  console.log('- Results are indicative only; engines differ in features and semantics.');
  console.log('- Some engines may do more work during compile than pure parsing.');
}

main();
