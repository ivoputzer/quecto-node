import { describe, it } from 'node:test'
import { deepStrictEqual, strictEqual, rejects, ok } from 'node:assert'

import { mapOptions, exitCode, runFile, runSuite } from '../cli.js'

describe('@quecto/test/cli', () => {
  describe('.mapOptions(args)', () => {
    const mockOS = { availableParallelism: () => 4 }
    const mockProcess = { cwd: () => '/current/working/directory' }

    it('maps defaults to execution config', () => {
      const { targets, parallel, match, ignore, register } = mapOptions([], mockOS, mockProcess)

      strictEqual(parallel, mockOS.availableParallelism())
      deepStrictEqual(targets, [mockProcess.cwd()])
      strictEqual(register, false)
      ok(match.test('my.test.js'))
      ok(ignore.test('node_modules'))
    })

    it('maps arguments to execution config', () => {
      const { targets, parallel, match, ignore, register } = mapOptions(['src', 'lib', '--parallel', '8', '--match', 'spec\\.js$', '--ignore', 'custom-regex', '--register'], mockOS, mockProcess)

      deepStrictEqual(targets, ['src', 'lib'])
      strictEqual(parallel, 8)
      strictEqual(register, true)
      ok(match.test('my.spec.js'))
      ok(ignore.test('custom-regex'))
    })

    it('maps short arguments to execution config', () => {
      const { targets, parallel, match, ignore, register } = mapOptions(['sources', '-p', '8', '-m', 'stories\\.js$', '-i', 'custom-regex', '-r'], mockOS, mockProcess)

      deepStrictEqual(targets, ['sources'])
      strictEqual(parallel, 8)
      strictEqual(register, true)
      ok(match.test('my.stories.js'))
      ok(ignore.test('custom-regex'))
    })
  })

  describe('.runFile(path)', () => {
    it('resolves process and injects loader via --register flag', async () => {
      const mockCpSuccess = {
        spawn: (cmd, args) => ({
          once: (event, fn) => {
            strictEqual(event, 'close')
            deepStrictEqual(args, ['--import', '@quecto/test/register', 'test_file.js'])
            fn(0)
          }
        })
      }
      console.log('test')
      await runFile('test_file.js', { register: true }, mockCpSuccess, { execPath: 'node', execArgv: [] })
    })

    it('respects parent process.execArgv inherently', async () => {
      const mockCpSuccess = {
        spawn: (cmd, args) => ({
          once: (event, fn) => {
            deepStrictEqual(args, ['--no-warnings', 'clean_file.js'])
            fn(0)
          }
        })
      }
      await runFile('clean_file.js', { register: false }, mockCpSuccess, { execPath: 'node', execArgv: ['--no-warnings'] })
    })

    it('rejects cleanly on process exit code > 0', async () => {
      const mockCpFail = { spawn: () => ({ once: (event, fn) => fn(1) }) }
      await rejects(runFile('broken.js', {}, mockCpFail, { execPath: 'node', execArgv: [] }), (err) => err === 'broken.js')
    })

    it('rejects instantly if the spawn engine throws a system error (e.g., ENOENT)', async () => {
      const mockCpError = {
        spawn () {
          throw new Error('spawn ENOENT') // Simulate Node.js throwing an error on the call stack immediately
        }
      }

      await rejects(
        runFile('non-existent-file.test.js', {}, mockCpError, { execPath: 'node', execArgv: [] }),
        (err) => err.message === 'spawn ENOENT',
        'Should forward systemic lifecycle errors straight up to the suite coordinator'
      )
    })

    it('generates a clean argument sequence when multiple parent flags exist', async () => {
      let capturedArgs = []
      const mockCpSuccess = {
        spawn: (cmd, args) => {
          capturedArgs = args
          return { once: (event, fn) => fn(0) }
        }
      }

      const parentFlags = ['--experimental-vm-modules', '--no-warnings']
      await runFile('target.test.js', { register: true }, mockCpSuccess, { execPath: 'node', execArgv: parentFlags })

      deepStrictEqual(
        capturedArgs,
        ['--experimental-vm-modules', '--no-warnings', '--import', '@quecto/test/register', 'target.test.js'],
        'Should array-spread all execution parameters into a single, perfectly indexed list'
      )
    })
  })

  describe('.runSuite(options)', () => {
    const mockProc = { stdout: { write: Function.prototype }, stderr: { write: Function.prototype } }
    const mockLibFs = {
      * findFiles () {
        yield 'a.js'
        yield 'b.js'
      }
    }
    it('coordinates multi-core virtual execution perfectly', async () => {
      const options = { targets: ['virt'], parallel: 2, match: /.*/, register: false }
      let filesRun = 0
      const mockCli = {
        exitCode: Function.prototype,
        async runFile () {
          filesRun++
        }
      }
      await runSuite(options, mockLibFs, mockCli, mockProc)
      strictEqual(filesRun, 2, 'Engine dropped tests in queue')
    })
  })

  describe('.exitCode(code)', () => {
    it('sets the exitCode of the current process', () => {
      const process = { exitCode: 0 }
      exitCode(1, process)
      strictEqual(process.exitCode, 1)
    })
  })
})
