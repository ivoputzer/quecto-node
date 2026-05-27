# The Test Runner Kata

> *"What is the first test you write when you write your own test runner?"*  
> — You make the file you are executing the test itself.

Writing a test runner is a rite of passage. It forces you to confront the deepest mechanics of the JavaScript runtime: the event loop, asynchronous state boundaries, error trapping, and concurrent memory management.

This Kata is an exercise in extreme minimalism. Your goal is to write a working, concurrent test runner from scratch. 

## The Rules of the Dojo

1. **Zero Dependencies:** You may not use `npm install`. You may only use the native primitives of the JavaScript language and your runtime (Node.js, Bun, Deno, or the Browser).
2. **The 100-Line Limit:** If your runner exceeds 100 lines of code, your architecture is too complex. Refactor, compress, and rethink.
3. **The Self-Testing Mandate:** Your runner must be able to execute a test suite that imports and tests the runner itself.

---

## The Journey (Phases of Enlightenment)

Do not skip ahead. Solve each level before moving to the next.

### Level 1: The Sequential Baseline
Write a function `test(label, fn)` that executes a function and prints the result to the console.
- If `fn` throws an error, it must catch it, print `✘ [label]`, and print the stack trace.
- If `fn` succeeds, it must print `✔ [label]`.
- **The Trap:** Does your runner crash the whole process if the first test throws an error? It shouldn't.

### Level 2: The Asynchronous Boundary
Upgrade your runner to support the event loop.
- It must support asynchronous functions (`async () => {}`).
- It must support legacy callbacks `((done) => { done() })`.
- **The Trap:** Does your Node process exit before your asynchronous `setTimeout` finishes? How do you keep the runtime alive without using a global array?

### Level 3: The Tree
Upgrade your runner to support nested tests (suites).
- A user should be able to call `test()` inside of another `test()`.
- The terminal output must be correctly indented to reflect the hierarchy.
- **The Trap:** How do you know which test is the parent and which is the child without forcing the user to pass a variable around?

### Level 4: The Concurrency Matrix
Upgrade your runner to execute sibling tests concurrently, rather than sequentially.
- If Test A takes 100ms and Test B takes 50ms, they should run at the same time.
- **The Trap 1:** You are not allowed to use `Worker` threads or OS child processes. You must achieve concurrency purely by multiplexing the V8 Promise micro-task queue.
- **The Trap 2:** If Test A and Test B both call `console.log()` at the exact same time, how do you prevent their text from interleaving and tearing in the terminal? 

---

## The Ultimate Validation

When you believe you have mastered the Kata, your runner must be able to cleanly execute this exact file without modification:

```javascript
import { test } from './my-runner.js'
import { strictEqual, ok } from 'node:assert'

test('My Test Runner', async () => {
  
  test('Handles sync', () => {
    ok(true)
  })

  test('Handles async suspension', async () => {
    strictEqual(await Promise.resolve(42), 42)
  })

  test('Traps errors without crashing', () => {
    strictEqual(1, 2) // Should fail cleanly
  })

  test('Runs these nested tests concurrently', { concurrency: 2 }, async () => {
    test('Worker A', async () => await new Promise(r => setTimeout(r, 20)))
    test('Worker B', async () => await new Promise(r => setTimeout(r, 10)))
  })

})
```

### Conclusion
**If you solved this, you now understand the event loop better than 90% of the industry.**
If you want to see how we solved it using pure ES2025 Generators and `node:async_hooks`, check out the source code of `@quecto/test`.
