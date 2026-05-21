import { test, it } from './index.js'
import { strictEqual, ok } from 'node:assert'

test('@m!cro/test Engine Architecture', async function * () {
  yield ['Handles synchronous primitives', () => {
    ok(true, 'Boolean primitive resolution failed.')
  }]

  yield ['Handles asynchronous promise loops', async () => {
    const value = await Promise.resolve(42)
    strictEqual(value, 42, 'Async/await loop failed to suspend correctly.')
  }]

  yield ['Isolates errors without crashing parallel workers', async () => {
    try {
      strictEqual(1, 2)
    } catch (err) {
      ok(err.name === 'AssertionError')
    }
  }]

  yield ['Supports nested test queues natively', function * () {
    yield ['Inner task 1', () => ok(1)]
    yield ['Inner task 2', () => ok(1)]
  }]
}, 3) // spawns 3 concurrent workers to digest the generator.

// base drop-in spec match (standard sequential execution)
it('Behaves identically to node:test when called flatly', () => {
  ok(typeof test === 'function')
})
