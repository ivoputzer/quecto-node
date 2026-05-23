import fs from 'node:fs'
import path from 'node:path'

/**
 * Recursively scans directories to find files matching a regular expression.
 *
 * @param {string | string[]} bases
 * @param {RegExp | null | undefined} match
 * @param {RegExp | null | undefined} ignore
 * @param {typeof import('node:fs')} [fs]
 * @param {typeof import('node:path')} [path]
 * @returns {Generator<string, void, unknown>}
 */
export function * findFiles (bases, match, ignore, { statSync, readdirSync } = fs, { join } = path) {
  for (const base of [].concat(bases)) {
    if (ignore?.test(base)) continue
    if (statSync(base).isFile()) {
      yield base
      continue
    }
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const fullPath = join(base, entry.name)
      if (entry.isDirectory()) {
        yield * findFiles(fullPath, match, ignore, { statSync, readdirSync }, { join })
      } else if (match?.test(fullPath) ?? true) {
        yield fullPath
      }
    }
  }
}

/**
 * Native, zero-dependency recursive directory watcher.
 * Drops ignored files at the OS boundary for zero-allocation performance.
 *
 * @param {string | string[]} bases
 * @param {RegExp} [match]
 * @param {RegExp} [ignore]
 * @param {typeof import('node:fs/promises')} [fsPromises]
 * @returns {AsyncGenerator<string, void, unknown>}
 */
export async function * watchFiles (bases, match, ignore, { watch } = fs.promises) {
  const ac = new AbortController()
  const q = []
  const w = []
  const targets = [].concat(bases)
  let pending = targets.length
  for (const base of targets) {
    pump(watch, base, match, ignore, ac.signal, (x) => w.length ? w.shift()(x) : q.push(x))
  }
  try {
    while (true) {
      const item = q.length ? q.shift() : await new Promise(resolve => w.push(resolve))
      if (item === null) {
        if (!--pending) break // Break when all workers have reported death
        continue
      }
      if (item instanceof Error) throw item
      yield item
    }
  } finally {
    ac.abort() // OS teardown guarantee when consumer breaks loop
  }
  // pure, stateless event pump
  async function pump (watch, base, match, ignore, signal, push) {
    try {
      for await (const { filename } of watch(base, { recursive: true, signal })) {
        if (!filename || ignore?.test(filename) || match?.test(filename) === false) continue
        push(filename)
      }
    } catch (err) {
      if (err.name !== 'AbortError') push(err)
    } finally {
      push(null) // uncoordinated exit signal
    }
  }
}
