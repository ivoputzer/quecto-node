# The Concurrency Pool Kata

> *"How do you pass data between parallel threads without locking the memory?"*
> — You don't. You make the threads pull the data themselves.

Building a concurrency pool in JavaScript forces you to confront the realities of the event loop. Without OS-level threads, you must multiplex the V8 Promise microtask queue. If you do it wrong, you create massive memory leaks, detached floating promises, and event loop congestion.

This Kata challenges you to build a stateless, concurrent execution throttle using Native Generators.

## The Rules of the Dojo
1. **Zero Dependencies:** You may not use `npm install`. You may only use native ECMAScript.
2. **The 100-Line Limit:** If your engine exceeds 100 lines, you are over-engineering it.
3. **No Heavy Objects:** You may not create `LinkedList`, `Queue`, or `WorkerTracker` classes. You must rely purely on V8's native Array pointer mechanics and primitive closures.

---

## The Journey (Phases of Enlightenment)

Do not skip ahead. Solve each level before moving to the next.

### Level 1: The Sequential Generator
Write an async generator `async function* pool(iterable, concurrency, fn)` that completely ignores `concurrency` and just runs the items one by one.
- **The Trap:** Does your function work if the user passes a standard Array `[1, 2, 3]`? What if they pass an AsyncGenerator? You must handle both `iterable[Symbol.iterator]()` and `iterable[Symbol.asyncIterator]()`.

### Level 2: The Eager Workers
Upgrade your pool to spawn `N` concurrent worker loops.
- Do not map the entire array to promises using `Promise.all`. The workers must *pull* from the iterator one by one.
- As workers finish, push the results into a `queue` array.
- The main generator loop should `yield` items from the queue.
- **The Trap:** If the `queue` is empty, how does the generator wait for the next item without using a `while(true)` busy-wait loop that freezes the CPU?

### Level 3: The Direct Handoff (Starvation Mode)
Use modern `Promise.withResolvers()` to suspend the consumer when the queue is empty.
- When a worker finishes its task, it must check if the consumer is currently suspended waiting for an item.
- If the consumer is waiting, the worker must resolve the promise *directly*, bypassing the `queue` array entirely.

### Level 4: The Phantom Leak
Upgrade your pool to handle early termination.
- What happens if the user calls `break` inside their `for await` loop after only 2 items?
- **The Trap:** If you don't explicitly tell your workers to stop, they will continue pulling from the iterator and executing the function in the background, invisibly draining API rate limits and memory. How do you signal them to die when the generator's `finally` block is triggered?

### Level 5: The Sync Fast-Path
If the user passes a synchronous Array, calling `await iterator.next()` forces V8 to allocate a useless Promise wrapper, delaying execution by a microtask tick.
- Upgrade your worker loop to sniff the iterator type. If it is synchronous, drop the `await` keyword on `.next()`.

---

## The Ultimate Validation

When you believe you have mastered the Kata, your pool must pass this exact test suite using `@quecto/test`:

```javascript
import { test } from '@quecto/test'
import { strictEqual, ok } from 'node:assert'
import { pool } from './my-pool.js'

test('The Pool Engine', async () => {

  test('Yields results out of order (First-Completed-First-Yielded)', async () => {
    const stream = pool([50, 10], 2, (ms) => new Promise(r => setTimeout(() => r(ms), ms)))
    const results = []
    for await (const res of stream) results.push(res)

    strictEqual(results[0], 10) // The 10ms task should finish and yield first!
    strictEqual(results[1], 50)
  })

  test('Instantly kills workers if the consumer breaks early', async () => {
    let executions = 0
    const stream = pool([1, 2, 3, 4, 5], 1, async () => {
      executions++
      return new Promise(r => setTimeout(r, 10))
    })

    for await (const res of stream) break // consumer stops immediately

    await new Promise(r => setTimeout(r, 50)) // wait for background tasks
    strictEqual(executions, 1) // Workers must not continue processing!
  })

  test('Propagates errors and halts', async () => {
    const stream = pool([1, 2, 3], 2, async (val) => {
      if (val === 2) throw new Error('Boom')
      return val
    })

    try {
      for await (const res of stream) {}
      strictEqual(true, false) // Should not reach here
    } catch (err) {
      strictEqual(err.message, 'Boom')
    }
  })
})
```

### Conclusion
**If you solved this, you now understand memory allocation and generator control flow better than 90% of the industry.**
If you want to see how we solved it using pure ES2025 `Promise.withResolvers()`, check out the source code of `@quecto/pool`.
