import { test } from 'node:test'
import { findFiles, runFile, parseCLI, runSuite } from '../bin/cli.js'
import { deepStrictEqual, strictEqual, rejects, ok } from 'node:assert'

test('@quecto/test CLI Mechanics: Dependency Injection Matrix', async (t) => {
  await t.test('parseCLI: Maps arguments elegantly to execution config', () => {
    const mockOS = { parallelism: () => 4 }

    // Test Default Fallbacks
    const defaults = parseCLI([], mockOS)
    strictEqual(defaults.dir, 'test')
    strictEqual(defaults.concurrency, 4)
    strictEqual(defaults.register, false)
    ok(defaults.filter.test('my.test.js'))

    // Test Flag Overrides
    const explicit = parseCLI(['src', '-p', '8', '-m', 'spec\\.js$', '-r'], mockOS)
    strictEqual(explicit.dir, 'src')
    strictEqual(explicit.concurrency, 8)
    strictEqual(explicit.register, true)
    ok(explicit.filter.test('my.spec.js'))
  })

  await t.test('findFiles: Recursively traverses and filters files without hitting disk', () => {
    const mockFs = {
      readdirSync: (base) => {
        if (base === 'project') return [{ name: 'a.test.js', isDirectory: () => false }]
        return []
      }
    }
    const mockPath = { join: (a, b) => `${a}/${b}` }
    const results = [...findFiles('project', /\.test\.js$/, mockFs, mockPath)]
    deepStrictEqual(results, ['project/a.test.js'])
  })

  await t.test('runFile: Resolves process and injects loader via --register flag', async () => {
    const mockCpSuccess = {
      spawn: (cmd, args) => ({
        on: (event, fn) => {
          strictEqual(event, 'close')
          // Validates that it successfully injected the flag right before the file
          deepStrictEqual(args, ['--import', '@quecto/test/register', 'test_file.js'])
          fn(0)
        }
      })
    }
    await runFile('test_file.js', { register: true }, mockCpSuccess, { execPath: 'node', execArgv: [] })
  })

  await t.test('runFile: Respects parent process.execArgv inherently', async () => {
    const mockCpSuccess = {
      spawn: (cmd, args) => ({
        on: (event, fn) => {
          // It passed down the parent's flag naturally
          deepStrictEqual(args, ['--no-warnings', 'clean_file.js'])
          fn(0)
        }
      })
    }
    await runFile('clean_file.js', { register: false }, mockCpSuccess, { execPath: 'node', execArgv: ['--no-warnings'] })
  })

  await t.test('runFile: Rejects cleanly on process exit code > 0', async () => {
    const mockCpFail = { spawn: () => ({ on: (event, fn) => fn(1) }) }
    await rejects(runFile('broken.js', {}, mockCpFail, { execPath: 'node', execArgv: [] }), (err) => err === 'broken.js')
  })

  await t.test('runSuite: Coordinates multi-core virtual execution perfectly', async () => {
    let filesRun = 0
    function * mockFind () { yield 'a.js'; yield 'b.js' }
    const mockRun = async () => { filesRun++ }
    const mockProc = { get exitCode () { }, set exitCode (v) {} }

    await runSuite(
      { dir: 'virt', concurrency: 2, filter: /.*/, register: false },
      { _find: mockFind, _run: mockRun, _log: () => {}, _err: () => {}, _proc: mockProc }
    )

    strictEqual(filesRun, 2, 'Engine dropped tests in queue')
  })
})
