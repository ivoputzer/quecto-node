import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createTask, resolveOptions, evaluate, run, report } from './lib/test.js'

export const ctx = new AsyncLocalStorage()
const originalLog = console.log

console.log = (...args) => {
  const task = ctx.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

export function createRunner (proc = process) {
  const rootTask = createTask('QUECTO_ROOT_NODE')
  let rootPromise = null

  function decorate (task) {
    const fn = task.fn
    if (!fn || task.isSuite) return

    task.fn = async (context, finalize) => {
      let curr = task.parent
      const befores = []; const afters = []

      // Dynamic Runtime Hook Pulling
      while (curr) {
        if (curr.bddBefore) befores.unshift(...curr.bddBefore) // Outer first
        if (curr.bddAfter) afters.push(...curr.bddAfter)       // Inner first
        curr = curr.parent
      }

      for (const hook of befores) await evaluate(hook, context)

      await new Promise((resolve, reject) => {
        const done = (err) => err ? reject(err) : resolve()
        try {
          const result = fn(context, done)
          if (result?.then) result.then(() => resolve(), reject)
          else if (fn.length < 2) resolve()
        } catch (err) { reject(err) }
      })

      for (const hook of afters) await evaluate(hook, context)
    }
  }

  function scheduleRoot () {
    if (!rootPromise) {
      rootPromise = new Promise(resolve => {
        setImmediate(() => {
          const matrixCtx = {
            run: (store, cb) => ctx.run(store, cb),
            onTask: decorate
          }
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
      const fn = typeof args[1] === 'function' ? args[1] : args[2]
      const task = createTask(...args)
      const parent = ctx.getStore() || rootTask

      task.parent = parent
      task.isSuite = isSuite

      if (isSuite) {
        task.setup = fn // The Matrix will natively await the Suite AST Builder!
        task.fn = null
      } else {
        decorate(task)
      }

      parent.children.push(task)

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
    before: (fn) => (ctx.getStore() || rootTask).before.push(fn),
    after: (fn) => (ctx.getStore() || rootTask).after.push(fn),
    beforeEach: (fn) => {
      const node = ctx.getStore() || rootTask
      node.bddBefore = node.bddBefore || []
      node.bddBefore.push(fn)
    },
    afterEach: (fn) => {
      const node = ctx.getStore() || rootTask
      node.bddAfter = node.bddAfter || []
      node.bddAfter.push(fn)
    }
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
