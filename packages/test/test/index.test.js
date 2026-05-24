import { describe as suite, it as nodeTest } from 'node:test'
import { strictEqual, deepStrictEqual, ok } from 'node:assert'

import { createRunner, ctx } from '../index.js'

const silentRun = async (fn) => {
  const fakeProc = {
    stdout: { write: () => {} },
    stderr: { write: () => {} },
    env: {},
    exitCode: 0
  }

  const runner = createRunner(fakeProc)

  // Nullifying the context severs the connection to the outer test runner
  return await ctx.run(null, () => fn(runner))
}

suite('@quecto/test » Public API Integration', () => {
  nodeTest('Constructs and executes root AST node natively', async () => {
    await silentRun(async ({ test }) => {
      const result = await test('Root', () => { ok(true) })
      strictEqual(result.name, 'QUECTO_ROOT_NODE')
      strictEqual(result.children[0].name, 'Root')
      strictEqual(result.children[0].error, undefined)
    })
  })

  nodeTest('Nests children invisibly via AsyncLocalStorage context', async () => {
    await silentRun(async ({ test }) => {
      const result = await test('Parent', async () => {
        await test('Child 1', () => ok(true))
        await test('Child 2', () => ok(true))
      })
      const parent = result.children[0]
      strictEqual(parent.name, 'Parent')
      strictEqual(parent.children.length, 2)
      strictEqual(parent.children[0].name, 'Child 1')
      strictEqual(parent.children[1].name, 'Child 2')
    })
  })

  nodeTest('Intercepts console logs and attaches them to the active node', async () => {
    await silentRun(async ({ test }) => {
      const result = await test('Logger', () => {
        console.log('Line 1')
        console.log('Line 2')
      })
      deepStrictEqual(result.children[0].logs, ['Line 1', 'Line 2'])
    })
  })

  nodeTest('Propagates nested beforeEach and afterEach cleanly through BDD execution map', async () => {
    await silentRun(async ({ describe, it, before, after, beforeEach, afterEach }) => {
      const runOrder = []

      await describe('BDD Mapper', () => {
        after(() => runOrder.push('suite_after'))
        before(() => runOrder.push('suite_before'))
        afterEach(() => runOrder.push('each_after'))
        beforeEach(() => runOrder.push('each_before'))

        it('Leaf 1', () => runOrder.push('test_1'))
        it('Leaf 2', () => runOrder.push('test_2'))
      })

      deepStrictEqual(runOrder, [
        'suite_before',
        'each_before',
        'test_1',
        'each_after',
        'each_before',
        'test_2',
        'each_after',
        'suite_after'
      ])
    })
  })

  nodeTest('Tape style t.test() hook inheritance', async () => {
    const runOrder = []
    await silentRun(async ({ describe, it, beforeEach }) => {
      await describe('Tape Parent', () => {
        beforeEach(() => runOrder.push('before_each'))

        it('Leaf Wrapper', async (t) => {
          runOrder.push('leaf')
          await t.test('Tape Child', () => runOrder.push('child'))
        })
      })
    })

    deepStrictEqual(runOrder, ['before_each', 'leaf', 'before_each', 'child'])
  })

  nodeTest('Async BDD Suite Evaluation', async () => {
    const runOrder = []
    await silentRun(async ({ describe, it, beforeEach }) => {
      await describe('Async Suite', async () => {
        beforeEach(() => runOrder.push('before_each'))
        // Simulate async latency (e.g. database/network call)
        await new Promise(resolve => setTimeout(resolve, 50))
        it('Async Test', () => runOrder.push('test'))
      })
    })

    deepStrictEqual(runOrder, ['before_each', 'test'])
  })

  nodeTest('Flat/Floating style suite with late-declared beforeEach', async () => {
    const runOrder = []
    await silentRun(async ({ test, beforeEach }) => {
      await test('suite', () => {
        test('t1', () => runOrder.push('test1'))
        test('t2', () => runOrder.push('test2'))
        beforeEach(() => runOrder.push('before'))
      })
    })

    deepStrictEqual(runOrder, ['before', 'test1', 'before', 'test2'])
  })
})
