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

// The Implicit File-Level Root Task
const rootTask = createTask('QUECTO_ROOT_NODE')
let rootPromise = null

function scheduleRoot () {
  if (!rootPromise) {
    rootPromise = new Promise(resolve => {
      // Drain the entire AST on the next tick, after the file finishes synchronous evaluation
      setImmediate(() => {
        run(rootTask, ctx).then(result => {
          report(result)
          if (process.env.QUECTO_TEST_EXIT_CODE) process.exitCode = 1
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

    // Phase 1: Leaf nodes statically inherit hooks from ancestors during AST construction
    if (!isSuite) {
      let curr = parent
      const befores = []; const afters = []
      while (curr) {
        if (curr.bddBefore) befores.unshift(...curr.bddBefore)
        if (curr.bddAfter) afters.push(...curr.bddAfter)
        curr = curr.parent
      }
      task.before.push(...befores)
      task.after.push(...afters)
    } else {
      task.fn = null // Suites do not execute inside the Matrix
    }

    parent.children.push(task)

    // Phase 1: Suites evaluate synchronously to build the tree immediately
    if (isSuite && fn) {
      ctx.run(task, () => {
        try { fn() } catch (err) { task.error = err }
      })
    }

    return parent === rootTask ? scheduleRoot() : Promise.resolve()
  }

  api.skip = (name, opts, fn) => api(name, resolveOptions(opts, { skip: true }), fn || opts)
  api.only = (name, opts, fn) => api(name, resolveOptions(opts, { only: true }), fn || opts)
  return api
}

export const describe = createInterface(true)
export const it = createInterface(false)
export const test = createInterface(false)

export const before = (fn) => (ctx.getStore() || rootTask).before.push(fn)
export const after = (fn) => (ctx.getStore() || rootTask).after.push(fn)
export const beforeEach = (fn) => {
  const node = ctx.getStore() || rootTask
  node.bddBefore = node.bddBefore || []
  node.bddBefore.push(fn)
}
export const afterEach = (fn) => {
  const node = ctx.getStore() || rootTask
  node.bddAfter = node.bddAfter || []
  node.bddAfter.push(fn)
}
