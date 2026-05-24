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

  nodeTest('describe block with all kind of hooks', async () => {
    const runOrder = []
    await silentRun(async ({ test, describe, before, after, beforeEach, afterEach }) => {
      await describe('suite1', () => {
        describe('suite2', () => {
          test('suite2_test1', () => runOrder.push('suite2_test1'))
          test('suite2_test2', () => runOrder.push('suite2_test2'))
          after(() => runOrder.push('suite2_after'))
          before(() => runOrder.push('suite2_before'))
          beforeEach(() => runOrder.push('suite2_beforeEach'))
          afterEach(() => runOrder.push('suite2_afterEach'))
        })
        test('suite1_test1', () => runOrder.push('suite1_test1'))
        test('suite1_test2', () => runOrder.push('suite1_test2'))
        after(() => runOrder.push('suite1_after'))
        before(() => runOrder.push('suite1_before'))
        beforeEach(() => runOrder.push('suite1_beforeEach'))
        afterEach(() => runOrder.push('suite1_afterEach'))
      })
    })

    deepStrictEqual(runOrder.join(', '), 'suite1_before, suite2_before, suite1_beforeEach, suite2_beforeEach, suite2_test1, suite2_afterEach, suite1_afterEach, suite1_beforeEach, suite2_beforeEach, suite2_test2, suite2_afterEach, suite1_afterEach, suite2_after, suite1_beforeEach, suite1_test1, suite1_afterEach, suite1_beforeEach, suite1_test2, suite1_afterEach, suite1_after')
  })

  nodeTest('test block with all kind of hooks', async () => {
    const runOrder = []
    await silentRun(async ({ test, describe, before, after, beforeEach, afterEach }) => {
      await test('suite1', () => {
        test('suite2', () => {
          test('suite2_test1', () => runOrder.push('suite2_test1'))
          test('suite2_test2', () => runOrder.push('suite2_test2'))
          after(() => runOrder.push('suite2_after'))
          before(() => runOrder.push('suite2_before'))
          beforeEach(() => runOrder.push('suite2_beforeEach'))
          afterEach(() => runOrder.push('suite2_afterEach'))
        })
        test('suite1_test1', () => runOrder.push('suite1_test1'))
        test('suite1_test2', () => runOrder.push('suite1_test2'))
        after(() => runOrder.push('suite1_after'))
        before(() => runOrder.push('suite1_before'))
        beforeEach(() => runOrder.push('suite1_beforeEach'))
        afterEach(() => runOrder.push('suite1_afterEach'))
      })
    })

    deepStrictEqual(runOrder.join(', '), 'suite1_before, suite1_beforeEach, suite2_before, suite1_beforeEach, suite2_beforeEach, suite2_test1, suite2_afterEach, suite1_afterEach, suite1_beforeEach, suite2_beforeEach, suite2_test2, suite2_afterEach, suite1_afterEach, suite2_after, suite1_afterEach, suite1_beforeEach, suite1_test1, suite1_afterEach, suite1_beforeEach, suite1_test2, suite1_afterEach, suite1_after')
  })

  nodeTest('Integration: Engine Architecture & Concurrency', async () => {
    const result = await silentRun(async ({ test }) => {
      return await test('@quecto/test » Engine Architecture', { concurrency: 3 }, async (t) => {
        await t.test('Handles synchronous primitives', () => { ok(true) })

        await t.test('Handles asynchronous promise loops', async () => {
          const value = await Promise.resolve(42)
          strictEqual(value, 42)
        })

        await t.test('Isolates errors without crashing parallel workers', async () => {
          try { strictEqual(1, 2) } catch (err) { ok(err.name === 'AssertionError') }
        })

        await t.test('Supports nested test queues natively', async (t) => {
          await t.test('Inner task 1', () => ok(1))
          await t.test('Inner task 2', () => ok(1))
        })
      })
    })

    strictEqual(result.error, undefined)
    const suiteNode = result.children[0]
    strictEqual(suiteNode.name, '@quecto/test » Engine Architecture')
    strictEqual(suiteNode.children[0].error, undefined)
    strictEqual(suiteNode.children[1].error, undefined)
    strictEqual(suiteNode.children[2].error, undefined)
    strictEqual(suiteNode.children[3].children[0].error, undefined)
  })

  nodeTest('Integration: Everything E2E Suite & Console Trapping', async () => {
    const result = await silentRun(async ({ test }) => {
      return await test('@quecto/test » The Everything E2E Suite', { concurrency: 2 }, async (t) => {
        await t.test('Tape Style Execution', async (t) => {
          await t.test('Nested Tape', () => ok(true))
        })

        await t.test('Console Trap Integration', () => {
          console.log('This log will be beautifully attached under this test.')
          console.log('Even if 5 other tests are running right now.')
          ok(true)
        })
      })
    })

    strictEqual(result.error, undefined)
    const suiteNode = result.children[0]
    strictEqual(suiteNode.children[0].children[0].error, undefined)
    deepStrictEqual(suiteNode.children[1].logs, [
      'This log will be beautifully attached under this test.',
      'Even if 5 other tests are running right now.'
    ])
  })

  nodeTest('Integration: BDD Ecosystem with Hooks & Pruning', async () => {
    const result = await silentRun(async ({ describe, it, before, after }) => {
      return await describe('@quecto/test » BDD Ecosystem with Hooks', () => {
        let state = 0

        before(() => { state = 10 })
        after(() => { strictEqual(state, 11) })

        it('Reads from hook', () => {
          strictEqual(state, 10)
          state++
        })

        describe('Pruning mechanics', () => {
          it.skip('I am deliberately ignored', () => { throw new Error('Boom') })
          it('I am bypassed because my sibling is an .only', () => { throw new Error('Boom') })
          it.only('I am the exclusive test in this block', () => { ok(true) })
        })
      })
    })

    strictEqual(result.error, undefined)
    const bddSuite = result.children[0]
    strictEqual(bddSuite.children[0].error, undefined) // 'Reads from hook' passed

    const pruningSuite = bddSuite.children[1]
    strictEqual(pruningSuite.children[0].skipped, true)  // Skip runs correctly
    strictEqual(pruningSuite.children[1].skipped, true)  // Bypassed by only
    strictEqual(pruningSuite.children[2].skipped, undefined) // Only runs
    strictEqual(pruningSuite.children[2].error, undefined)
  })
})
