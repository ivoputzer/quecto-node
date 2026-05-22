import { describe, it, test, before, after } from '../index.js'
import { ok, strictEqual } from 'node:assert'
import * as p from 'node:timers/promises'

test('@quecto/test » Engine Architecture', { concurrency: 3 }, async (t) => {
  await t.test('Handles synchronous primitives', () => { ok(true) })

  await t.test('Handles asynchronous promise loops', async () => {
    const value = await Promise.resolve(42)
    strictEqual(value, 42) // Now if you change this to 40, it WILL fail!
  })

  await t.test('Isolates errors without crashing parallel workers', async () => {
    try { strictEqual(1, 2) } catch (err) { ok(err.name === 'AssertionError') }
  })

  await t.test('Supports nested test queues natively', async (t) => {
    await t.test('Inner task 1', () => ok(1))
    await t.test('Inner task 2', () => ok(1))
  })
})

test('@quecto/test » The Everything E2E Suite', { concurrency: 2 }, async (t) => {
  await t.test('Tape Style Execution', async (t) => {
    await t.test('Nested Tape', () => ok(true))
  })

  // @skipped because it would fail the CI but might be used locally for testing
  await t.test('Forceful Abort Timeout Execution', { skip: true, timeout: 10 }, async (t) => {
    try { await p.setTimeout(5000, null, { signal: t.signal }) } catch (err) { if (err.name !== 'AbortError') throw err }
  })

  await t.test('Console Trap Integration', () => {
    console.log('This log will be beautifully attached under this test.')
    console.log('Even if 5 other tests are running right now.')
    ok(true)
  })
})

describe('@quecto/test » BDD Ecosystem with Hooks', () => {
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

test('@quecto/test » I am an independent top-level root node', () => {
  ok(true)
})
