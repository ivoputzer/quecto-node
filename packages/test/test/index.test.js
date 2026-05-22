import { describe, it } from 'node:test'
import { deepStrictEqual, strictEqual, ok } from 'node:assert'

import { _internals } from '../index.js'
const { normalize, buildNode, buildOpts, runNode, report } = _internals

describe('@quecto/test', () => {
  describe('.buildNode(name, opts, fn)', () => {
    it('Constructs a pure execution node with default options', () => {
      const fn = () => {}
      const node = buildNode('A', fn)
      strictEqual(node.name, 'A')
      strictEqual(node.fn, fn)
      deepStrictEqual(node.opts, {})
      deepStrictEqual(node.children, [])
    })

    it('Extracts configuration objects successfully', () => {
      const fn = () => {}
      const node = buildNode('B', { concurrency: 2 }, fn)
      deepStrictEqual(node.opts, { concurrency: 2 })
      strictEqual(node.fn, fn)
    })
  })
  describe('.buildOpts(optsOrFn, extra)', () => {
    it('Returns extra object if no options were provided', () => {
      deepStrictEqual(buildOpts(() => {}, { skip: true }), { skip: true })
    })

    it('Merges user options with internal modifiers', () => {
      deepStrictEqual(buildOpts({ timeout: 10 }, { only: true }), { timeout: 10, only: true })
    })
  })
  describe('.normalize(fn, t, timeout, ac, DI)', () => {
    it('Resolves synchronous functions immediately', async () => {
      let state = 0
      await normalize(() => { state = 1 })
      strictEqual(state, 1)
    })

    it('Resolves native Promises gracefully', async () => {
      await normalize(async () => await Promise.resolve())
      ok(true)
    })

    it('Supports (t, done) callback signatures', async () => {
      await normalize((t, done) => done())
      ok(true)
    })

    it('Traps callback errors and rejects', async () => {
      try {
        await normalize((t, done) => done(new Error('Trap')))
        ok(false, 'Should have thrown')
      } catch (err) {
        strictEqual(err.message, 'Trap')
      }
    })

    it('Triggers AbortController on Timeout', async () => {
      let aborted = false
      const ac = { abort: () => { aborted = true } }

      // DI injects immediate execution for the timer
      const setTimer = (cb) => { cb(); return 99 }

      try {
        await normalize(() => new Promise(() => {}), {}, 50, ac, { setTimer, clrTimer: () => {} })
      } catch (err) {
        strictEqual(err.message, 'Timeout: 50ms exceeded')
        strictEqual(aborted, true, 'AbortController was not triggered')
      }
    })
  })
  describe('.runNode(node) - The Tree Execution Matrix', () => {
    it('Executes suite lifecycles (Tree Builder -> Before -> Children -> After)', async () => {
      const timeline = []
      const parent = buildNode('Suite', () => { timeline.push('build_tree') })
      parent.after.push(() => { timeline.push('after') })
      parent.before.push(() => { timeline.push('before') })

      const child = buildNode('Test', () => { timeline.push('run_test') })
      parent.children.push(child)

      await runNode(parent)
      deepStrictEqual(timeline, ['build_tree', 'before', 'run_test', 'after'])
    })

    it('Traps unhandled execution errors into node.error', async () => {
      const node = buildNode('Fail', () => { throw new Error('Crashed') })
      await runNode(node)
      strictEqual(node.error.message, 'Crashed')
    })

    it('Calculates duration dynamically without relying on strict timer ticks', async () => {
      const node = buildNode('Timer', async () => await new Promise(resolve => setTimeout(resolve, 10)))
      await runNode(node)
      strictEqual(typeof node.duration, 'number')
      ok(node.duration > 0, 'Duration should be a positive integer')
    })

    it('Applies .skip modifier natively', async () => {
      const node = buildNode('SkipMe', { skip: true }, () => { throw new Error('Should not run') })
      await runNode(node)
      strictEqual(node.skipped, true)
      strictEqual(node.error, undefined)
    })

    it('Prunes siblings if a child possesses the .only modifier', async () => {
      const parent = buildNode('Parent', () => {})
      const c1 = buildNode('C1', () => {})
      const c2 = buildNode('C2', { only: true }, () => {})
      parent.children.push(c1, c2)

      await runNode(parent)

      strictEqual(c1.skipped, true, 'Sibling was not skipped')
      strictEqual(c2.skipped, undefined, '.only node should not be skipped')
    })
  })
  describe('.report(node, indent, DI) - The Atomic Output Buffer', () => {
    const env = { npm_package_name: 'test-runner' }

    it('Formats and writes a successful leaf node', () => {
      const out = []
      const node = { name: 'Leaf', duration: 2, children: [], logs: [] }
      report(node, '', { out: (s) => out.push(s), errOut: () => {}, env })
      ok(out[0].includes('✔ Leaf (2ms)'))
    })

    it('Formats and writes a successful suite node', () => {
      const out = []
      const node = { name: 'Suite', duration: 10, children: [{ name: 'Child', children: [], logs: [] }], logs: [] }
      report(node, '', { out: (s) => out.push(s), errOut: () => {}, env })
      ok(out[0].includes('▶ Suite (10ms)'))
    })

    it('Formats skipped tests', () => {
      const out = []
      const node = { name: 'Bypassed', skipped: true, children: [], logs: [] }
      report(node, '', { out: (s) => out.push(s), errOut: () => {}, env })
      ok(out[0].includes('- Bypassed (skipped)'))
    })

    it('Trims internal framework stack traces on failure', () => {
      const errOut = []
      const err = new Error('Assertion Failed')
      err.stack = 'Error\n    at user.js:10\n    at test-runner/index.js:50\n    at node:internal/timers'

      const node = { name: 'Fail', duration: 1, children: [], logs: [], error: err }
      report(node, '', { out: () => {}, errOut: (s) => errOut.push(s), env })

      const output = errOut[0]
      ok(output.includes('✘ Fail'))
      ok(output.includes('user.js:10'))
      ok(!output.includes('test-runner/index.js'))
      ok(!output.includes('node:internal'))
    })

    it('Prints buffered console.logs with perfect indentation', () => {
      const out = []
      const node = { name: 'Logs', duration: 0, children: [], logs: ['Line 1', 'Line 2\nLine 3'] }
      report(node, '  ', { out: (s) => out.push(s), errOut: () => {}, env })

      ok(out[1].includes('    | Line 1'))
      ok(out[2].includes('    | Line 2'))
      ok(out[2].includes('    | Line 3'))
    })
  })
})
