import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createTest, resolveOptions, evaluate, run, report } from './lib/test.js'
import { createMock } from './lib/mock.js'

export const ctx = new AsyncLocalStorage()
const originalLog = console.log

console.log = (...args) => {
  const task = ctx.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

export function createRunner (proc = process) {
  const rootTask = createTest('QUECTO_ROOT_NODE')
  let rootPromise = null

  function scheduleRoot () {
    if (!rootPromise) {
      rootPromise = new Promise(resolve => {
        setImmediate(() => {
          const matrixCtx = { run: (store, cb) => ctx.run(store, cb) }
          run(rootTask, matrixCtx).then(result => {
            report(result, '', proc)
            if (proc.env.QUECTO_TEST_EXIT_CODE) proc.exitCode = 1
            resolve(result)
          })
        })
      })
    }
    return rootPromise
  }

  function createInterface (isSuite) {
    const api = (...args) => {
      const test = createTest(...args)
      const parent = ctx.getStore() || rootTask

      test.isSuite = isSuite // <-- Injects the DNA
      test.parent = parent

      parent.children.push(test)

      return parent === rootTask ? scheduleRoot() : Promise.resolve()
    }

    api.skip = (name, opts, fn) => api(name, resolveOptions(opts, { skip: true }), fn || opts)
    api.only = (name, opts, fn) => api(name, resolveOptions(opts, { only: true }), fn || opts)
    return api
  }

  return {
    test: createInterface(false),
    describe: createInterface(true),
    it: createInterface(false),
    // 2. Push directly into the isolated hooks storage!
    before: (fn) => (ctx.getStore() || rootTask).hooks.before.push(fn),
    after: (fn) => (ctx.getStore() || rootTask).hooks.after.push(fn),
    beforeEach: (fn) => (ctx.getStore() || rootTask).hooks.beforeEach.push(fn),
    afterEach: (fn) => (ctx.getStore() || rootTask).hooks.afterEach.push(fn)
  }
}

const defaultRunner = createRunner()

export const test = defaultRunner.test
export const describe = defaultRunner.describe
export const it = defaultRunner.it
export const before = defaultRunner.before
export const after = defaultRunner.after
export const beforeEach = defaultRunner.beforeEach
export const afterEach = defaultRunner.afterEach
export const mock = createMock()
