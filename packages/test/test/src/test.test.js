import { describe, it } from 'node:test'
import { deepStrictEqual, strictEqual, ok } from 'node:assert'
import { evaluate, TestNode, resolveOptions, run, report } from '../../src/test.js'

const createTest = (...args) => new TestNode(...args)

// Simple mock context since our engine relies on DI for Context Tracking internally

describe('@quecto/test/lib/test', () => {
  describe('.createTest(name, opts, fn)', () => {
    it('Constructs a pure execution task with default options', () => {
      const fn = () => {}
      const task = createTest('A', fn)
      strictEqual(task.name, 'A')
      strictEqual(task.fn, fn)
      deepStrictEqual(task.opts, {})
      deepStrictEqual(task.children, [])
    })

    it('Extracts configuration objects successfully', () => {
      const fn = () => {}
      const task = createTest('B', { concurrency: 2 }, fn)
      deepStrictEqual(task.opts, { concurrency: 2 })
      strictEqual(task.fn, fn)
    })
  })

  describe('.resolveOptions(optsOrFn, extra)', () => {
    it('Returns extra object if no options were provided', () => {
      deepStrictEqual(resolveOptions(() => {}, { skip: true }), { skip: true })
    })

    it('Merges user options with internal modifiers', () => {
      deepStrictEqual(resolveOptions({ timeout: 10 }, { only: true }), { timeout: 10, only: true })
    })
  })

  describe('.evaluate(fn, context, timeout, abortController[, globalThis])', () => {
    it('Resolves synchronous functions immediately', async () => {
      let state = 0
      await evaluate(() => { state = 1 })
      strictEqual(state, 1)
    })

    it('Resolves native Promises gracefully', async () => {
      await evaluate(async () => await Promise.resolve())
      ok(true)
    })

    it('Supports (context, done) callback signatures', async () => {
      await evaluate((context, done) => done())
      ok(true)
    })

    it('Traps callback errors and rejects', async () => {
      try {
        await evaluate((context, done) => done(new Error('Trap')))
        ok(false, 'Should have thrown')
      } catch (err) {
        strictEqual(err.message, 'Trap')
      }
    })

    it('Triggers AbortController on Timeout', async () => {
      let aborted = false
      const ac = { abort: () => { aborted = true } }

      // DI injects immediate execution for the timer
      const setTimeout = (cb) => { cb(); return 99 }

      try {
        await evaluate(() => new Promise(() => {}), {}, 50, ac, { setTimeout, clearTimeout: () => {} })
      } catch (err) {
        strictEqual(err.message, 'Timeout: 50ms exceeded')
        strictEqual(aborted, true, 'AbortController was not triggered')
      }
    })
  })

  describe('.run(task, env) - The Tree Execution Matrix', () => {
    const env = { wrap: (store, next) => next(), notify: Function.prototype }

    it('Executes suite lifecycles (Tree Builder -> Before -> Children -> After)', async () => {
      const timeline = []
      const parent = createTest('Suite') // builds tree
      parent.after.push(() => { timeline.push('after') })
      parent.before.push(() => { timeline.push('before') })

      const child = createTest('Test', () => { timeline.push('run_test') })
      parent.children.push(child)

      await run(parent, env)
      deepStrictEqual(timeline, ['before', 'run_test', 'after'])
    })

    it('Traps unhandled execution errors into task.error', async () => {
      const task = createTest('Fail', () => { throw new Error('Crashed') })
      await run(task, env)
      strictEqual(task.error.message, 'Crashed')
    })

    it('Calculates duration dynamically without relying on strict timer ticks', async () => {
      const task = createTest('Timer', async () => await new Promise(resolve => setTimeout(resolve, 10)))
      await run(task, env)
      strictEqual(typeof task.duration, 'number')
      ok(task.duration > 0, 'Duration should be a positive integer')
    })

    it('Applies .skip modifier natively', async () => {
      const task = createTest('SkipMe', { skip: true }, () => { throw new Error('Should not run') })
      await run(task, env)
      strictEqual(task.skipped, true)
      strictEqual(task.error, undefined)
    })

    it('Prunes siblings if a child possesses the .only modifier', async () => {
      const parent = createTest('Parent', () => {})
      const c1 = createTest('C1', () => {})
      const c2 = createTest('C2', { only: true }, () => {})
      parent.children.push(c1, c2)

      await run(parent, env)

      strictEqual(c1.skipped, true, 'Sibling was not skipped')
      strictEqual(c2.skipped, undefined, '.only node should not be skipped')
    })
  })

  describe('.report(task, indent[, process]) - The Atomic Output Buffer', () => {
    const env = { npm_package_name: 'test-runner' }

    it('Formats and writes a successful leaf task', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Leaf', duration: 2, children: [], logs: [] }
      report(task, '', mockProc)
      ok(out[0].includes('✔ Leaf (2ms)'))
    })

    it('Formats and writes a successful suite task', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Suite', duration: 10, children: [{ name: 'Child', children: [], logs: [] }], logs: [] }
      report(task, '', mockProc)
      ok(out[0].includes('▶ Suite (10ms)'))
    })

    it('Formats skipped tests', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Bypassed', skipped: true, children: [], logs: [] }
      report(task, '', mockProc)
      ok(out[0].includes('- Bypassed (skipped)'))
    })

    it('Trims internal framework stack traces on failure', () => {
      const errOut = []
      const mockProc = { stdout: { write: () => {} }, stderr: { write: s => errOut.push(s) }, env }
      const err = new Error('Assertion Failed')
      err.stack = 'Error\n    at user.js:10\n    at test-runner/lib/test.js:50\n    at node:internal/timers'

      const task = { name: 'Fail', duration: 1, children: [], logs: [], error: err }
      report(task, '', mockProc)

      const output = errOut[0]
      ok(output.includes('✘ Fail'))
      ok(output.includes('user.js:10'))
      ok(!output.includes('test-runner/lib/test.js'))
      ok(!output.includes('node:internal'))
    })

    it('Prints buffered console.logs with perfect indentation', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Logs', duration: 0, children: [], logs: ['Line 1', 'Line 2\nLine 3'] }
      report(task, '  ', mockProc)

      ok(out[1].includes('    | Line 1'))
      ok(out[2].includes('    | Line 2'))
      ok(out[2].includes('    | Line 3'))
    })
  })
})
