import { spawn } from 'node:child_process'
for(const key of ['CRADLE_TEST_DOCKER_HOST','CRADLE_TEST_IMAGE'])if(!process.env[key]?.trim())throw new Error(`${key} is required for real isolated runner verification; skipped execution is not acceptance`)
const child=spawn(process.execPath,[
  '--import','./tests/helpers/typescript-loader.mjs','--test','--test-concurrency=1',
  'tests/authoring-runner.mjs',
  'tests/construction-evaluation.mjs',
  'tests/releases-rehearsal.mjs',
  'tests/releases-sqlite.mjs',
  'tests/authoring-restart.mjs',
  'tests/intelligence-runner.mjs',
],{stdio:'inherit',env:process.env})
child.once('error',error=>{console.error(error);process.exitCode=1})
child.once('exit',code=>{process.exitCode=code??1})
