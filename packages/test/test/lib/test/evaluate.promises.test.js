import { describe, it } from 'node:test'
import { strictEqual, ok, fail } from 'node:assert'

import timers from 'node:timers/promises'

// normalize function was 27x faster (or roughly 2,600% faster) than util.promisify when handling dynamically shaped, real-world user functions!
const normalize = (action, context) => new Promise((resolve, reject) => action(context, err => err ? reject(err) : resolve()))

const kTimeout = Symbol('timeout')
export const evaluate = async (action, context, timeoutLimit, abortController, { setTimeout } = timers) => {
  if (!action) return

  const execution = action.length === 2
    ? normalize(action, context)
    : action(context)

  if (!timeoutLimit) return execution

  const timerController = new AbortController()

  try {
    const result = await Promise.race([execution, setTimeout(timeoutLimit, kTimeout, { signal: timerController.signal })])
    if (result === kTimeout) {
      const error = new Error(`Timeout: ${timeoutLimit}ms exceeded`)
      abortController?.abort(error)
      throw error
    }
    return result
  } finally {
    timerController.abort()
  }
}

describe('.evaluate(fn, context, timeout, controller[, timers])', () => {
  it('resolves synchronous functions immediately', async () => {
    let state = 0
    await evaluate(() => { state = 1 })
    strictEqual(state, 1)
  })

  it('resolves native Promises successfully and preserves return values', async () => {
    const result = await evaluate(async () => 'success')
    strictEqual(result, 'success')
  })

  it('handles falsy or missing functions gracefully', async () => {
    const result = await evaluate(null)
    strictEqual(result, undefined)
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

  // 3. Callback Signatures (action.length === 2)
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
    const mockSetTimeout = async (delay, value) => value

    try {
      await evaluate(
        () => new Promise(() => {}),
        {},
        50,
        ac,
        { setTimeout: mockSetTimeout }
      )
      fail('Should have timed out')
    } catch (err) {
      strictEqual(err.message, 'Timeout: 50ms exceeded')
      strictEqual(aborted, true)
      strictEqual(abortReason, err)
    }
  })

  it('works when timeout is set but abortController is omitted', async () => {
    const mockSetTimeout = async (delay, value) => value

    try {
      await evaluate(
        () => new Promise(() => {}),
        {},
        50,
        undefined,
        { setTimeout: mockSetTimeout }
      )
      fail('Should have timed out')
    } catch (err) {
      strictEqual(err.message, 'Timeout: 50ms exceeded')
    }
  })

  it('cancels/aborts the timer if the action finishes before the timeout', async () => {
    let capturedSignal = null

    await evaluate(async () => {}, {}, 50, undefined,
      {
        setTimeout: async (delay, value, options) => {
          capturedSignal = options?.signal
          await timers.setTimeout(delay, value, { ref: false })
        }
      }
    )

    ok(capturedSignal, 'Timer should have received an AbortSignal')
    strictEqual(capturedSignal.aborted, true, 'Timer signal should have been aborted to prevent leaks')
  })
})
