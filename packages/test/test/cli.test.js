import { test } from 'node:test'
import { findFiles, runFile } from '../bin/cli.js'
import { deepStrictEqual, strictEqual, rejects } from 'node:assert'

test('@quecto/test CLI Mechanics: Dependency Injection Matrix', async (t) => {
  await t.test('findFiles: Recursively traverses and filters files without hitting disk', () => {
    const mockFs = {
      readdirSync: (base) => {
        if (base === 'project') {
          return [
            { name: 'a.test.js', isDirectory: () => false },
            { name: 'subDir', isDirectory: () => true },
            { name: 'ignore.js', isDirectory: () => false }
          ]
        }
        if (base === 'project/subDir') {
          return [{ name: 'b.test.js', isDirectory: () => false }]
        }
        return []
      }
    }
    const mockPath = { join: (a, b) => `${a}/${b}` }

    const results = [...findFiles('project', /\.test\.js$/, mockFs, mockPath)]
    deepStrictEqual(results, ['project/a.test.js', 'project/subDir/b.test.js'])
  })

  await t.test('runFile: Resolves successfully on process exit code 0', async () => {
    const mockCpSuccess = {
      spawn: (cmd, args) => ({
        on: (event, fn) => {
          strictEqual(event, 'close')
          strictEqual(args[0], 'test_file.js')
          fn(0) // Trigger success
        }
      })
    }

    await runFile('test_file.js', mockCpSuccess, { execPath: 'node' })
  })

  await t.test('runFile: Rejects cleanly on process exit code > 0', async () => {
    const mockCpFail = {
      spawn: () => ({
        on: (event, fn) => fn(1) // Trigger failure
      })
    }

    await rejects(
      runFile('broken_file.js', mockCpFail, { execPath: 'node' }),
      (err) => err.includes('broken_file.js')
    )
  })
})
