import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createTask, resolveOptions, run, report } from './lib/test.js'

const ctx = new AsyncLocalStorage()
const originalLog = console.log

console.log = (...args) => {
  const task = ctx.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

/**
 * Core execution primitive of @quecto/test.
 * Evaluates a test or suite, invisibly binds it to the active async context,
 * and queues it for execution in the matrix.
 *
 * @param {string} name - The human-readable label for the test.
 * @param {Object|Function} [opts] - Configuration (e.g., { concurrency: 2, timeout: 50 }) or the test block.
 * @param {Function} [fn] - The execution block (sync, async, or (t, done) callback).
 * @returns {Promise<Object>} Resolves to the collapsed AST node once completely drained.
 */

export function test (...args) {
  const task = createTask(...args)
  const parent = ctx.getStore()
  if (parent) {
    parent.children.push(task)
    return Promise.resolve()
  }
  return run(task, ctx).then(result => {
    report(result)
    if (process.env.QUECTO_TEST_EXIT_CODE) process.exitCode = 1
    return result
  })
}

test.only = (name, opts, fn) => test(name, resolveOptions(opts, { only: true }), fn || opts)
test.skip = (name, opts, fn) => test(name, resolveOptions(opts, { skip: true }), fn || opts)

export const describe = test
export const it = test
export const before = (fn) => ctx.getStore()?.before.push(fn)
export const after = (fn) => ctx.getStore()?.after.push(fn)
