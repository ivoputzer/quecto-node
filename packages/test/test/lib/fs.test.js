import { describe, it } from 'node:test'
import { strictEqual, deepStrictEqual } from 'node:assert/strict'
import { findFiles, watchFiles } from '../../lib/fs.js'

describe('@quecto/test/lib/fs', () => {
  describe('.findFiles(bases, match, ignore)', () => {
    const mockPath = { join: (a, b) => `${a}/${b}` }

    it('yields explicit file directly without traversing', () => {
      const mockFs = {
        statSync: () => ({ isFile: () => true })
      }
      deepStrictEqual([
        ...findFiles(['file1.js', 'file2.js'], null, null, mockFs, {})
      ], ['file1.js', 'file2.js'])
    })

    it('recursively traverses directories yielding matching files', () => {
      const mockFs = {
        statSync: () => ({ isFile: () => false }),
        readdirSync: (base) => {
          if (base === 'project') return [{ name: 'a.test.js', isDirectory: () => false }]
          return []
        }
      }
      deepStrictEqual([
        ...findFiles(['project'], /\.test\.js$/, null, mockFs, mockPath)
      ], ['project/a.test.js'])
    })

    it('bypasses ignored directories', () => {
      let readdirCalled = false
      const mockFs = {
        statSync: () => ({ isFile: () => false }),
        readdirSync: () => {
          readdirCalled = true
          return []
        }
      }
      deepStrictEqual([
        ...findFiles(['node_modules'], null, /node_modules/, mockFs, {})
      ], [])
      deepStrictEqual(readdirCalled, false, 'Should have stopped before reading directory')
    })

    it('gracefully yields all files when match and ignore are omitted', () => {
      const mockFs = {
        statSync: () => ({ isFile: () => false }),
        readdirSync: () => [{ name: 'file.txt', isDirectory: () => false }]
      }
      deepStrictEqual([
        ...findFiles(['src'], null, null, mockFs, mockPath)
      ], ['src/file.txt'])
    })

    it('skips ignored directories but continues processing valid directories', () => {
      const readDirectories = []
      const mockFs = {
        statSync: () => ({ isFile: () => false }),
        readdirSync: (base) => {
          readDirectories.push(base)
          if (base === 'src') return [{ name: 'index.test.js', isDirectory: () => false }]
          return []
        }
      }
      deepStrictEqual([
        ...findFiles(['node_modules', 'src'], null, /node_modules/, mockFs, mockPath)
      ], ['src/index.test.js'], 'Should only yield files from the non-excluded path')
      deepStrictEqual(readDirectories, ['src'], 'Should have only invoked readdirSync on valid targets')
    })
  })

  describe('.watchFiles(bases, match, ignore)', () => {
    const watchIterable = (events) => ({
      async * [Symbol.asyncIterator] () {
        for (const event of events) yield event
      }
    })

    it('streams matching changed files from the native watcher loop', async () => {
      const mockFs = {
        watch: () => watchIterable([{ eventType: 'change', filename: 'src/auth.test.js' }])
      }

      const stream = watchFiles(['.'], /\.test\.js$/, null, mockFs)
      const result = await stream.next()

      strictEqual(result.done, false)
      strictEqual(result.value, 'src/auth.test.js')
    })

    it('filters out ignored paths and mismatched file signatures seamlessly', async () => {
      const mockFs = {
        watch: () => watchIterable([
          { eventType: 'change', filename: 'node_modules/lodash/index.js' },
          { eventType: 'change', filename: 'src/index.js' },
          { eventType: 'change', filename: 'src/http.test.js' }
        ])
      }

      const stream = watchFiles(['.'], /\.test\.js$/, /node_modules/, mockFs)

      const firstResult = await stream.next()
      strictEqual(firstResult.value, 'src/http.test.js')

      const finalResult = await stream.next()
      strictEqual(finalResult.done, true)
    })

    it('handles empty or missing filenames from erratic OS events gracefully', async () => {
      const mockFs = {
        watch: () => watchIterable([
          { eventType: 'change', filename: null },
          { eventType: 'change', filename: 'src/valid.test.js' }
        ])
      }

      const stream = watchFiles(['.'], /\.test\.js$/, null, mockFs)

      const result = await stream.next()
      strictEqual(result.value, 'src/valid.test.js', 'Should skip the null entry instead of crashing')
    })

    it('traps OS errors natively and routes them through the microtask yield', async () => {
      const di = {
        watch: () => ({
          async * [Symbol.asyncIterator] () {
            yield { filename: 'valid.test.js' }
            throw new Error('OS Permission Denied')
          }
        })
      }

      const stream = watchFiles(['.'], /\.test\.js$/, null, di)
      const first = await stream.next()
      strictEqual(first.value, 'valid.test.js')

      try {
        await stream.next()
        strictEqual(true, false, 'Should have thrown natively')
      } catch (err) {
        strictEqual(err.message, 'OS Permission Denied')
      }
    })

    it('handles multiple base directories independently', async () => {
      const capturedRoots = []
      const mockFs = {
        watch: (base) => {
          capturedRoots.push(base)
          return watchIterable([{ eventType: 'change', filename: `${base}/app.test.js` }])
        }
      }

      const stream = watchFiles(['src', 'lib'], /\.test\.js$/, null, mockFs)
      const first = await stream.next()
      const second = await stream.next()

      deepStrictEqual(capturedRoots, ['src', 'lib'], 'Should spin up an OS watcher for each requested base root')
      // Note: Due to Promise.race on simultaneous mocks, order might technically vary,
      // but the test will catch if an event is dropped completely.
      const results = [first.value, second.value].sort()
      deepStrictEqual(results, ['lib/app.test.js', 'src/app.test.js'])
    })

    it('handles interleaved events from concurrent watchers without dropping them', async () => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

      // We simulate real-world asynchronous file changes.
      // Without the fix, the slower 'lib' event gets dropped entirely!
      const mockFs = {
        watch: (base) => ({
          [Symbol.asyncIterator]: async function * () {
            if (base === 'src') {
              await delay(10)
              yield { eventType: 'change', filename: 'src/auth.test.js' }
              await delay(20)
              yield { eventType: 'change', filename: 'src/api.test.js' }
            } else if (base === 'lib') {
              await delay(20)
              yield { eventType: 'change', filename: 'lib/utils.test.js' }
            }
          }
        })
      }

      const stream = watchFiles(['src', 'lib'], /\.test\.js$/, null, mockFs)
      const results = []

      for await (const file of stream) {
        results.push(file)
      }
      // Ensures we got all 3 events, in chronological order based on the mock delays
      deepStrictEqual(results, [
        'src/auth.test.js',   // resolved at ~10ms
        'lib/utils.test.js',  // resolved at ~20ms
        'src/api.test.js'     // resolved at ~30ms (10ms + 20ms)
      ])
    })
  })
})
