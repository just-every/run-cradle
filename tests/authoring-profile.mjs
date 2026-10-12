import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('runner qualification refuses each absent or blank required input without running/skipping a suite', () => {
  for (const key of ['CRADLE_TEST_DOCKER_HOST', 'CRADLE_TEST_IMAGE']) {
    for (const value of [undefined, '', '   ']) {
      const env = { ...process.env, CRADLE_TEST_DOCKER_HOST: 'unix:///does-not-exist.test.sock', CRADLE_TEST_IMAGE: 'test-unreachable-image' }
      delete env[key]
      if (value !== undefined) env[key] = value
      const result = spawnSync(process.execPath, ['scripts/test-runner.mjs'], { env, encoding: 'utf8', timeout: 10000 })
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, new RegExp(`${key} is required`))
      assert.match(result.stderr, /skipped execution is not acceptance/)
      assert.doesNotMatch(result.stdout, /TAP version|# tests|# skipped/)
    }
  }
})
