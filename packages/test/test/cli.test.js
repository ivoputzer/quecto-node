import { describe, it } from 'node:test'
import { findFiles, runFile, parseCLI, runSuite } from '../bin/cli.js'
import { deepStrictEqual, strictEqual, rejects, ok } from 'node:assert'

describe('@quecto/test/cli', () => {
  it('.parseCLI() Maps arguments elegantly to execution config', () => {
    const mockOS = { parallelism: () => 4 }

    const defaults = parseCLI([], mockOS)
    deepStrictEqual(defaults.targets, ['test'])
    strictEqual(defaults.concurrency, 4)
    strictEqual(defaults.register, false)
    ok(defaults.filter.test('my.test.js'))

    const explicit = parseCLI(['src', 'lib', '-p', '8', '-m', 'spec\\.js$', '-r'], mockOS)
    deepStrictEqual(explicit.targets, ['src', 'lib'])
    strictEqual(explicit.concurrency, 8)
    strictEqual(explicit.register, true)
    ok(explicit.filter.test('my.spec.js'))
  })

  it('.findFiles() Yields explicit file directly without traversing', () => {
    const mockFs = { statSync: () => ({ isFile: () => true }) }
    const results = [...findFiles(['file1.js', 'file2.js'], /\.test\.js$/, mockFs, {})]
    deepStrictEqual(results, ['file1.js', 'file2.js'])
  })

  it('.findFiles() Recursively traverses and filters directories', () => {
    const mockFs = {
      statSync: () => ({ isFile: () => false }),
      readdirSync: (base) => {
        if (base === 'project') return [{ name: 'a.test.js', isDirectory: () => false }]
        return []
      }
    }
    const mockPath = { join: (a, b) => `${a}/${b}` }
    const results = [...findFiles(['project'], /\.test\.js$/, mockFs, mockPath)]
    deepStrictEqual(results, ['project/a.test.js'])
  })

  it('.runFile() Resolves process and injects loader via --register flag', async () => {
    const mockCpSuccess = {
      spawn: (cmd, args) => ({
        on: (event, fn) => {
          strictEqual(event, 'close')
          deepStrictEqual(args, ['--import', '@quecto/test/register', 'test_file.js'])
          fn(0)
        }
      })
    }
    await runFile('test_file.js', { register: true }, mockCpSuccess, { execPath: 'node', execArgv: [] })
  })

  it('.runFile() Respects parent process.execArgv inherently', async () => {
    const mockCpSuccess = {
      spawn: (cmd, args) => ({
        on: (event, fn) => {
          deepStrictEqual(args, ['--no-warnings', 'clean_file.js'])
          fn(0)
        }
      })
    }
    await runFile('clean_file.js', { register: false }, mockCpSuccess, { execPath: 'node', execArgv: ['--no-warnings'] })
  })

  it('.runFile() Rejects cleanly on process exit code > 0', async () => {
    const mockCpFail = { spawn: () => ({ on: (event, fn) => fn(1) }) }
    await rejects(runFile('broken.js', {}, mockCpFail, { execPath: 'node', execArgv: [] }), (err) => err === 'broken.js')
  })

  it('.runSuite() Coordinates multi-core virtual execution perfectly', async () => {
    let filesRun = 0
    function * mockFind () { yield 'a.js'; yield 'b.js' }
    const mockRun = async () => { filesRun++ }
    const mockProc = { set exitCode (v) {} }

    await runSuite(
      { targets: ['virt'], concurrency: 2, filter: /.*/, register: false },
      { _find: mockFind, _run: mockRun, _log: () => {}, _err: () => {}, _proc: mockProc }
    )

    strictEqual(filesRun, 2, 'Engine dropped tests in queue')
  })
})
