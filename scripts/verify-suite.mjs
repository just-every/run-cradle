import {readFile} from 'node:fs/promises';
import {run} from './verify-app.mjs';

// Reuse the package's complete Node test file list while splitting it across CI
// workers. New files added to that public suite automatically join its shards.
const [suite, shard, extra] = process.argv.slice(2);
const match = /^(\d+)\/(\d+)$/.exec(shard ?? '');
if (extra || !match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) throw Error('Usage: verify-suite.mjs PACKAGE_SCRIPT INDEX/TOTAL');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const command = pkg.scripts?.[suite];
const prefix = /^node (?:--import \.\/tests\/helpers\/typescript-loader\.mjs )?--test /.exec(command ?? '')?.[0];
if (!prefix || /[;&|\n]/.test(command)) throw Error(`Expected a single Node test suite: ${suite}`);
run(command.replace(prefix, `${prefix}--test-shard=${shard} `));
