import { describe, it } from 'node:test'
import { ok } from 'node:assert'
import { text } from '../../src/reporter.js'

describe('src/reporter', () => {
  describe('.text(task, indent[, process]) - The Atomic Output Buffer', () => {
    const env = { npm_package_name: 'test-runner' }

    it('Formats and writes a successful leaf task', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Leaf', duration: 2, children: [], logs: [] }
      text(task, '', mockProc)
      ok(out[0].includes('✔ Leaf (2ms)'))
    })

    it('Formats and writes a successful suite task', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Suite', duration: 10, children: [{ name: 'Child', children: [], logs: [] }], logs: [] }
      text(task, '', mockProc)
      ok(out[0].includes('▶ Suite (10ms)'))
    })

    it('Formats skipped tests', () => {
      const out = []
      const mockProc = { stdout: { write: s => out.push(s) }, stderr: { write: () => {} }, env }
      const task = { name: 'Bypassed', skipped: true, children: [], logs: [] }
      text(task, '', mockProc)
      ok(out[0].includes('- Bypassed (skipped)'))
    })

    it('Trims internal framework stack traces on failure', () => {
      const errOut = []
      const mockProc = { stdout: { write: () => {} }, stderr: { write: s => errOut.push(s) }, env }
      const err = new Error('Assertion Failed')
      err.stack = 'Error\n    at user.js:10\n    at test-runner/lib/test.js:50\n    at node:internal/timers'

      const task = { name: 'Fail', duration: 1, children: [], logs: [], error: err }
      text(task, '', mockProc)

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
      text(task, '  ', mockProc)

      ok(out[1].includes('    | Line 1'))
      ok(out[2].includes('    | Line 2'))
      ok(out[2].includes('    | Line 3'))
    })
  })
})
