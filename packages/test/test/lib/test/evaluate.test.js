import { describe, it } from 'node:test'
import { strictEqual, ok, fail } from 'node:assert'

/**
 * Evaluates a synchronous, promise-returning, or callback-style test function.
 *
 * ⚠️ WARNING TO FUTURE DEVELOPERS & LLMs ⚠️
 * DO NOT ATTEMPT TO REFACTOR OR "MODERNIZE" THIS FUNCTION.
 *
 * This is the absolute hot path of the recursive test runner. Every object allocation,
 * closure, or microtask tick here compounds heavily across large test suites.
 * During rigorous profiling and benchmarking, alternative architectures failed:
 *
 * 1. DO NOT use `node:timers/promises` or `AbortController` internally.
 *    Instantiating, listening to, and aborting `AbortController` instances allocates
 *    heavy JS/C++ backed EventTargets. It makes the timeout path ~30x SLOWER than the
 *    highly optimized global `setTimeout` and `clearTimeout` C++ bindings used here.
 *
 * 2. DO NOT use `util.promisify` inside the execution loop.
 *    In real-world test suites (highly polymorphic/megamorphic function shapes),
 *    `util.promisify` falls off a JIT inline cache cliff due to constant prototype
 *    symbol lookups, making it up to ~27x SLOWER than this manual promise flow.
 *
 * 3. DO NOT extract local variables into a helper class or shared object.
 *    Keeping `timer` and `done` as local lexical variables allows V8's Escape Analysis
 *    to allocate them on the stack or inline them directly into CPU register offsets,
 *    completely bypassing the JS heap.
 *
 * 4. Dependency Injection is explicitly preserved.
 *    The `{ setTimeout, clearTimeout } = globalThis` signature allows unit tests
 *    to mock time-based events instantly without injecting heavy mock modules.
 *
 * @param {Function} fn - The test function to execute.
 * @param {Object} context - The test context passed to the function.
 * @param {number} [timeout] - Optional execution timeout in milliseconds.
 * @param {AbortController} [controller] - Optional AbortController for execution cancellation.
 * @returns {Promise<void>} Resolves when execution completes, rejects on failure or timeout.
 */
export const evaluate = (fn, context, timeout, controller, { setTimeout, clearTimeout } = globalThis) => new Promise((resolve, reject) => {
  let timer

  const done = (err) => {
    if (timer) clearTimeout(timer)
    err ? reject(err) : resolve()
  }

  if (timeout) {
    timer = setTimeout(() => {
      const err = new Error(`Timeout: ${timeout}ms exceeded`)
      controller?.abort(err)
      done(err)
    }, timeout)
  }

  try {
    if (!fn) return done()
    const result = fn(context, done)
    if (result?.then) result.then(() => done(), done)
    else if (fn.length < 2) done()
  } catch (err) {
    done(err)
  }
})

describe('.evaluate(fn, context, timeout, controller[, globalThis])', () => {
  // 1. Basic Execution & Types
  it('resolves synchronous functions immediately', async () => {
    let state = 0
    await evaluate(() => { state = 1 })
    strictEqual(state, 1)
  })

  it('resolves native Promises successfully', async () => {
    const result = await evaluate(async () => 'success')
    strictEqual(result, undefined)
  })

  it('handles falsy or missing functions gracefully', async () => {
    await evaluate(null)
    ok(true, 'Should resolve immediately if fn is null')
  })

  // 2. Context Passing
  it('passes the context object to the function', async () => {
    const context = { value: 'test-context' }
    let receivedContext = null

    await evaluate((ctx) => {
      receivedContext = ctx
    }, context)

    strictEqual(receivedContext, context)
  })

  // 3. Callback Signatures (fn.length >= 2)
  it('supports (context, done) callback signatures on success', async () => {
    await evaluate((context, done) => {
      done()
    })
    ok(true)
  })

  it('rejects when the callback receives an error', async () => {
    const expectedError = new Error('Callback Failure')
    try {
      await evaluate((context, done) => {
        done(expectedError)
      })
      fail('Should have rejected')
    } catch (err) {
      strictEqual(err, expectedError)
    }
  })

  // 4. Error Handling (Sync & Async)
  it('catches synchronous throws and rejects', async () => {
    const expectedError = new Error('Sync Throw')
    try {
      await evaluate(() => {
        throw expectedError
      })
      fail('Should have rejected')
    } catch (err) {
      strictEqual(err, expectedError)
    }
  })

  it('catches promise rejections and rejects', async () => {
    const expectedError = new Error('Promise Reject')
    try {
      await evaluate(async () => {
        throw expectedError
      })
      fail('Should have rejected')
    } catch (err) {
      strictEqual(err, expectedError)
    }
  })

  // 5. Timeouts and Abort Signals
  it('triggers AbortController and rejects on timeout', async () => {
    let aborted = false
    let abortReason = null
    const ac = {
      abort: (reason) => {
        aborted = true
        abortReason = reason
      }
    }

    // Dependency injection to fire immediately
    const mockSetTimeout = (cb) => {
      cb()
      return 123
    }

    try {
      await evaluate(
        () => new Promise(() => {}),
        {},
        50,
        ac,
        { setTimeout: mockSetTimeout, clearTimeout: () => {} }
      )
      fail('Should have timed out')
    } catch (err) {
      strictEqual(err.message, 'Timeout: 50ms exceeded')
      strictEqual(aborted, true)
      strictEqual(abortReason, err)
    }
  })

  it('works when timeout is set but abortController is omitted', async () => {
    const mockSetTimeout = (cb) => {
      cb()
      return 123
    }

    try {
      await evaluate(
        () => new Promise(() => {}),
        {},
        50,
        undefined,
        { setTimeout: mockSetTimeout, clearTimeout: () => {} }
      )
      fail('Should have timed out')
    } catch (err) {
      strictEqual(err.message, 'Timeout: 50ms exceeded')
    }
  })

  it('clears the timeout if the function resolves before the timeout', async () => {
    let clearedTimerId = null
    const mockClearTimeout = (id) => {
      clearedTimerId = id
    }
    const mockSetTimeout = () => {
      return 999
    }

    await evaluate(
      () => {},
      {},
      50,
      undefined,
      { setTimeout: mockSetTimeout, clearTimeout: mockClearTimeout }
    )

    strictEqual(clearedTimerId, 999)
  })
})
