import { describe, it } from '@quecto/test'
import { strictEqual, deepStrictEqual, rejects, ok } from 'node:assert'
import { pool } from '../index.js'

const delay = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms))

describe('@quecto/test/lib/pool', () => {
  it('correctly processes every item in the iterator', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = []

    for await (const res of pool(items, 2, async (x) => x * 2)) {
      results.push(res)
    }
    deepStrictEqual(results.sort((a, b) => a - b), [2, 4, 6, 8, 10])
  })

  it('limits concurrency mathematically', async () => {
    const items = [10, 10, 10, 10]
    const start = Date.now()

    for await (const ms of pool(items, 2, (ms) => delay(ms, ms))) {
      strictEqual(ms, 10)
    }

    const duration = Date.now() - start
    ok(duration >= 20, `Execution was too fast: ${duration}ms`)
    ok(duration < 38, `Execution was too slow: ${duration}ms`)
  })

  it('yields results out-of-order as they finish (First-Completed-First-Yielded)', async () => {
    const items = [30, 5]
    const results = []

    for await (const res of pool(items, 2, async (ms) => {
      await delay(ms)
      return ms
    })) {
      results.push(res)
    }

    deepStrictEqual(results, [5, 30])
  })

  it('isolates errors and propagates them down the generator boundary', async () => {
    const items = [1, 2, 3]
    const worker = async (x) => {
      if (x === 2) throw new Error('Crashed')
      return x
    }

    const run = async () => {
      const results = []
      for await (const res of pool(items, 2, worker)) {
        results.push(res)
      }
    }

    await rejects(run(), (err) => err.message === 'Crashed')
  })

  it('handles empty iterables instantly without hanging', async () => {
    let executed = 0
    for await (const _ of pool([], 5, () => executed++)) { /* noop */ }
    strictEqual(executed, 0)
  })

  it('drains safely when concurrency exceeds input length', async () => {
    const results = []
    for await (const res of pool([1, 2], 50, (x) => Promise.resolve(x))) {
      results.push(res)
    }
    deepStrictEqual(results.sort((a, b) => a - b), [1, 2])
  })

  it('instantly halts worker lanes and prevents background execution leaks on early break', async () => {
    let executed = 0
    const items = [1, 2, 3, 4, 5]

    for await (const item of pool(items, 2, async (x) => {
      executed++
      await delay(10)
      return x
    })) {
      if (item === 2) {
        break // Consumer breaks early!
      }
    }

    await delay(20)

    // With concurrency 2, while the consumer processes item 2, the workers eagerly grab items 3 and 4 from the queue due to V8 microtask ordering.
    // However, item 5 must be perfectly blocked by the `closed` state.
    strictEqual(executed, 4, 'Leak detected: task 5 was executed after consumer broke out')
  })

  it('respects external AbortSignal and halts completely', async () => {
    let executed = 0
    const items = [1, 2, 3, 4, 5]
    const ac = new AbortController()

    const run = async () => {
      for await (const item of pool(items, 2, async (x) => {
        executed++
        await delay(10)
        return x
      }, { signal: ac.signal })) {
        if (item === 2) {
          ac.abort(new Error('User Cancelled via Signal'))
        }
      }
    }

    await rejects(run(), (err) => err.message === 'User Cancelled via Signal')

    await delay(20)
    strictEqual(executed, 4, 'Pool leaked past microtask limits on AbortSignal')
  })

  it('supports native AsyncGenerators without breaking the destructuring boundary', async () => {
    // Simulates a chunked stream like fs.createReadStream
    async function * asyncStream () {
      yield 10; yield 20; yield 30
    }

    const results = []
    for await (const res of pool(asyncStream(), 2, async (x) => x / 2)) {
      results.push(res)
    }

    // Ensures values were destructured correctly out of the microtask
    deepStrictEqual(results.sort((a, b) => a - b), [5, 10, 15])
  })
})

describe('@quecto/test/lib/pool » Congestion Mode', () => {
  it('eagerly pulls from iterator while consumer is slow', async () => {
    let pulledFromIterator = 0
    let maxConcurrentWorkers = 0
    let currentWorkers = 0

    // A custom iterable to track exactly when items are pulled
    const trackedIterable = {
      [Symbol.iterator] () {
        return {
          next () {
            if (pulledFromIterator < 20) {
              pulledFromIterator++
              return { value: pulledFromIterator, done: false }
            }
            return { done: true }
          }
        }
      }
    }

    const results = []

    for await (const res of pool(trackedIterable, 5, async (x) => {
      currentWorkers++
      maxConcurrentWorkers = Math.max(maxConcurrentWorkers, currentWorkers)
      // Fast worker: 1ms
      await delay(1)
      currentWorkers--
      return x
    })) {
      // Slow consumer: 10ms
      await delay(10)
      results.push(res)
    }

    // Because workers take 1ms and consumer takes 10ms, the workers will outpace
    // the consumer and fully drain the iterable into the queue long before the
    // consumer finishes reading them.
    strictEqual(maxConcurrentWorkers, 5, 'Must never exceed concurrency limit')
    strictEqual(pulledFromIterator, 20, 'Must have eagerly pulled all items')
    strictEqual(results.length, 20, 'Must have yielded all results safely')
  })
})
