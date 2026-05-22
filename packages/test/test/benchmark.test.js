import { test, describe, it, before, after } from 'node:test'
import { ok, strictEqual } from 'node:assert'
import * as p from 'node:timers/promises'

// Ensure we fulfill the node:test execution contracts perfectly!
// Run via: node --import @quecto/test/register test/benchmark.test.js

test('Node/Flat Style: Synchronous execution', () => { ok(true) })
test('Node/Flat Style: Asynchronous execution using async function', async () => { ok(await p.setTimeout(10, true)) })
test('Node/Flat Style: Asynchronous execution returning a promise', () => p.setTimeout(10))
test('Node/Flat Style: Callback execution', (_, done) => { setTimeout(done, 10) })

test('Node Style: High-speed matrix with floating bindings', { concurrency: 3 }, async () => {
  let concurrentExecutions = 0
  await test('Floating Worker 1', async () => { concurrentExecutions++; await p.setTimeout(20); ok(concurrentExecutions > 0) })
  await test('Floating Worker 2', async () => { concurrentExecutions++; await p.setTimeout(10); ok(concurrentExecutions > 0) })
  await test('Floating Worker 3', async () => { concurrentExecutions++; await p.setTimeout(15); ok(concurrentExecutions > 0) })
})

test('Tape Style: Sync and Async Context Navigation', async (t) => {
  t.test('Synchronous tape execution', () => { ok(true) })
  await t.test('Asynchronous tape execution', async () => { const res = await Promise.resolve(42); strictEqual(res, 42) })
  await t.test('Callback tape execution', (t, done) => { setTimeout(() => { ok(true); done() }, 10) })
  await t.test('Deeply nested contexts', async (t) => {
    await t.test('Layer 2', async (t) => { t.test('Layer 3', () => ok(true)) })
  })
  t.skip('This tape test is bypassed')
})

describe('BDD Style: Context-less execution & Hooks', () => {
  let counter = 0
  before(async () => { await p.setTimeout(5); counter = 10 })
  after(() => { strictEqual(counter, 15) })

  it('Inherits state from before hook natively', () => { strictEqual(counter, 10); counter += 2 })
  it('Suspends cleanly via native Promises', async () => { await p.setTimeout(10); strictEqual(counter, 12); counter += 3 })
  it('Supports standard done callbacks in BDD', (t, done) => { setTimeout(() => { ok(true); done() }, 5) })

  describe('Nested BDD block', () => {
    it('Maintains isolation deeply 1', () => { ok(true) })
  })
})

describe('V1 Architecture Upgrades', { concurrency: 2 }, () => {
  it('Captures console logs flawlessly during concurrency', async () => {
    console.log('Fetching database connection...')
    await p.setTimeout(20)
    console.log('Connected! ID: 9482')
  })

  // @skipped because it would fail the CI but might be used locally for testing
  it.skip('Hangs forever but gets killed by timeout', { timeout: 50 }, async (t) => {
    await p.setTimeout(5000, null, { signal: t.signal })
  })
})
