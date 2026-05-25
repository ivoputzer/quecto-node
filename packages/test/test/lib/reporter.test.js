import { describe, it } from 'node:test'
import { ok, strictEqual } from 'node:assert/strict'
import { ipc, jsonl, text } from '../../lib/reporter.js'

describe('lib/reporters', () => {
  async function * mockStream () {
    yield { type: 'test:pass', data: { name: 'Suite 1', isSuite: true, duration: 10, depth: 0, logs: [] } }
    yield { type: 'test:pass', data: { name: 'Works', isSuite: false, duration: 2, depth: 1, logs: ['Hello'] } }
    yield { type: 'test:fail', data: { name: 'Broken', isSuite: false, duration: 1, depth: 1, error: new Error('Boom'), logs: [] } }
  }

  it('ipc reporter forwards events natively to process.send', async () => {
    const payloads = []
    const mockProcess = { send: (obj) => payloads.push(obj) }

    await ipc(mockStream(), mockProcess)

    strictEqual(payloads.length, 3)
    strictEqual(payloads[0].type, 'test:pass')
    strictEqual(payloads[2].type, 'test:fail')
  })

  it('jsonl reporter serializes flat objects cleanly and safely unpacks Errors', async () => {
    const lines = []
    const mockProcess = { stdout: { write: (str) => lines.push(str.trim()) } }

    await jsonl(mockStream(), mockProcess)

    strictEqual(lines.length, 3)
    const failEvent = JSON.parse(lines[2])
    strictEqual(failEvent.type, 'test:fail')
    ok(failEvent.data.error.includes('Error: Boom'), 'Error stack trace was not serialized')
  })

  it('text reporter renders visual spec tree via depth parameters', async () => {
    const stdoutLines = []
    const stderrLines = []
    const mockProcess = {
      stdout: { write: (str) => stdoutLines.push(str) },
      stderr: { write: (str) => stderrLines.push(str) },
      env: {}
    }

    await text(mockStream(), mockProcess)

    // Suite rendered correctly
    ok(stdoutLines[0].includes('▶ Suite 1 (10ms)'))

    // Logs flushed before test completion
    ok(stdoutLines[1].includes('  | Hello'))

    // Child test indented based on depth: 1
    ok(stdoutLines[2].includes('  ✔ Works (2ms)'))

    // Error formatted beautifully into stderr
    ok(stderrLines[0].includes('  ✘ Broken (1ms)'))
    ok(stderrLines[0].includes('Error: Boom'))
  })
})
