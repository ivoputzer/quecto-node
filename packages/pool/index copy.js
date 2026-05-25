const kComplete = Symbol('quecto:pool:complete')

/**
 * A stateless, concurrent execution throttle natively tuned for V8 registers.
 *
 * Consumes an iterable (synchronous or asynchronous) and processes it concurrently
 * using a Go-style worker-pull mechanism. It achieves zero-allocation hot paths
 * by utilizing a single deferred synchronization channel, bypassing the need for
 * massive Promise arrays or heavy event loop orchestration.
 *
 * @template T
 * @template R
 * @param {Iterable<T> | AsyncIterable<T>} iterable - The stream or array of items to process.
 * @param {number} concurrency - The maximum number of concurrently active worker lanes.
 * @param {(item: T) => Promise<R> | R} fn - The async worker function applied to each item.
 * @param {object} [options={}] - Configuration options.
 * @param {AbortSignal} [options.signal] - An AbortSignal to halt execution instantly.
 * @returns {AsyncGenerator<R, void, unknown>} An async generator yielding results as they complete (out-of-order/First-Completed-First-Yielded).
 */
export async function * pool (iterable, concurrency, fn, { signal } = {}) {
  const isAsync = !!iterable[Symbol.asyncIterator]
  const iterator = isAsync ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]()
  const queue = []
  let active = concurrency
  let next = null
  let error = null
  let closed = false
  const worker = async () => {
    try {
      while (true) {
        if (closed || error || signal?.aborted) break
        const { done, value } = isAsync ? await iterator.next() : iterator.next()
        if (done) break
        const result = await fn(value)
        if (closed || error || signal?.aborted) break
        if (next) {
          const { resolve } = next
          next = null
          resolve(result)
        } else {
          queue.push(result)
        }
      }
    } catch (err) {
      error = err
      if (next) {
        const { reject } = next
        next = null
        reject(err)
      }
    } finally {
      if (--active === 0) {
        if (next) next.resolve(kComplete)
        else queue.push(kComplete)
      }
    }
  }
  for (let i = 0; i < concurrency; i++) worker()
  try {
    while (true) {
      if (error) throw error
      signal?.throwIfAborted()
      let item
      if (queue.length) {
        item = queue.shift()
      } else {
        next = Promise.withResolvers()
        item = await next.promise
      }
      if (item === kComplete) break
      yield item
    }
  } finally {
    closed = true
  }
}
