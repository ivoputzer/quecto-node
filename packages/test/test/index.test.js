import { describe as suite, it as nodeTest } from 'node:test'
import { strictEqual, deepStrictEqual, ok } from 'node:assert'

import { test, describe, it, before, after } from '../index.js'

// Helper to precisely trap and restore global process mutations during our API tests
const silentRun = async (fn) => {
  const { stdout, stderr, exitCode, env } = process
  const writeOut = stdout.write
  const writeErr = stderr.write
  const prevExit = exitCode
  const prevEnvCode = env.QUECTO_TEST_EXIT_CODE

  stdout.write = () => {}
  stderr.write = () => {}
  process.exitCode = 0
  delete env.QUECTO_TEST_EXIT_CODE

  try {
    return await fn()
  } finally {
    stdout.write = writeOut
    stderr.write = writeErr
    process.exitCode = prevExit
    env.QUECTO_TEST_EXIT_CODE = prevEnvCode
  }
}

suite('@quecto/test » Public API Integration', () => {
  nodeTest('Exports correct aliases for BDD-style execution', () => {
    strictEqual(describe, test)
    strictEqual(it, test)
  })

  nodeTest('Constructs and executes root AST node natively', async () => {
    await silentRun(async () => {
      const result = await test('Root', () => { ok(true) })
      strictEqual(result.name, 'Root')
      strictEqual(result.children.length, 0)
      strictEqual(result.error, undefined)
    })
  })

  nodeTest('Nests children invisibly via AsyncLocalStorage context', async () => {
    await silentRun(async () => {
      const result = await test('Parent', async () => {
        await test('Child 1', () => ok(true))
        await test('Child 2', () => ok(true))
      })
      strictEqual(result.name, 'Parent')
      strictEqual(result.children.length, 2)
      strictEqual(result.children[0].name, 'Child 1')
      strictEqual(result.children[1].name, 'Child 2')
    })
  })

  nodeTest('Intercepts console logs and attaches them to the active node', async () => {
    await silentRun(async () => {
      const result = await test('Logger', () => {
        console.log('Line 1')
        console.log('Line 2')
      })
      deepStrictEqual(result.logs, ['Line 1', 'Line 2'])
    })
  })

  nodeTest('Hooks (before/after) append cleanly to the active context array', async () => {
    await silentRun(async () => {
      const result = await test('Hooker', () => {
        before(() => 1)
        after(() => 2)
      })
      strictEqual(result.before.length, 1)
      strictEqual(result.after.length, 1)
    })
  })

  nodeTest('Exposes and applies .skip and .only modifiers successfully', async () => {
    await silentRun(async () => {
      const result = await test('Modifiers', async () => {
        await test.skip('A', () => {})
        await test.only('B', () => {})
      })
      strictEqual(result.children[0].opts.skip, true)
      strictEqual(result.children[1].opts.only, true)
    })
  })

  nodeTest('Mutates process.exitCode and sets ENV flag upon failure', async () => {
    await silentRun(async () => {
      const result = await test('Failing Task', () => { throw new Error('Boom') })
      strictEqual(result.error.message, 'Boom')
      strictEqual(process.env.QUECTO_TEST_EXIT_CODE, '1')
      strictEqual(process.exitCode, 1)
    })
  })
})
