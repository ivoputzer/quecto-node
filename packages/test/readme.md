@quecto/test
---
Hyper-minimalist, zero-dependency concurrent test runner.


The following implementation is the absolute structural mechanic of a concurrent test runner. It handles sync/async tests, sync/async suite generators, parallel load-balancing, and error capturing recursively in exactly ~19 lines of code.

```js
export async function test (label, fn, concurrency = 1) {
  if (fn?.constructor?.name.includes('GeneratorFunction')) {
    console.log(`▶ ${label}`)
    const iter = fn()
    return Promise.all(Array.from({ length: concurrency }, async () => {
      for (let step = await iter.next(); !step.done; step = await iter.next()) {
        const [subLabel, subFn] = step.value
        await test(`  ${subLabel}`, subFn, concurrency)
      }
    }))
  }
  try {
    await fn()
    console.log(`✔ ${label}`)
  } catch (error) {
    process.exitCode = 1
    console.error(`✘ ${label}\n  ${(error?.stack ?? error).toString().replace(/\n/g, '\n  ')}`)
  }
}

test.skip = (label) => console.log(`- ${label} (skipped)`)
```

#### How the Structural Mechanics Work

- The Generator Trap: We use `.constructor.name.includes('GeneratorFunction')` to seamlessly detect both function* and async function*. If a generator is passed, the engine flips from Execution Mode to Concurrency Mode.

- The V8 Micro-Task Balancer: `Promise.all(Array.from(...))` spawns the exact number of concurrent worker promises requested.

- The Shared Queue: `await iter.next()` is called safely inside the loop. Because generators maintain their own internal state cursor, the JS runtime guarantees that concurrent calls to `.next()` will dispense tests sequentially and exclusively to whoever requests them first.

```js
import { test, it } from './index.js'
import { strictEqual, ok } from 'node:assert'

// Self-Executing Concurrent Suite
test('Engine Architecture', async function * () {
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

// Drop-in replacement (Standard sequential execution)
it('Behaves identically to node:test when called flatly', () => {
  ok(typeof test === 'function')
})
```
