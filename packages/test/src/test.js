import { createMock } from './mock.js'

export const resolveOptions = (optsOrFn, overrides) => typeof optsOrFn === 'function' ? overrides : { ...optsOrFn, ...overrides }

// this should be called normalize rather than evaluate
// what does it do?
// it normalizes calles, sync, async, and callback based calls, right?
// we have a try and catch, are we missing a finally?
export const evaluate = (fn, context, timeout, controller, { setTimeout, clearTimeout } = globalThis) => new Promise((resolve, reject) => {
  let timer

  const done = (err) => {
    if (timer) clearTimeout(timer)
    err ? reject(err) : resolve()
  }

  if (timeout) {
    timer = setTimeout(() => {
      const err = new Error(`Timeout: ${timeout}ms exceeded`)
      controller?.abort(err)
      done(err)
    }, timeout)
  }

  try {
    if (!fn) return done()
    const result = fn(context, done)
    if (result?.then) result.then(() => done(), done)
    else if (fn.length < 2) done()
  } catch (err) {
    done(err)
  }
})

const kSkip = Symbol('quecto:test:skip')

// The pure, recursive, pull-based V8 micro-task
// How should this function be called? run will interfere with the public interface run which node:test uses also:
// - execute
// - runTest
// - walk (to stay in AST terms?)
export async function run (task, env) {
  if (env?.signal?.aborted) {
    task.skipped = true
    return task
  }

  const start = Date.now()
  const timeoutController = task.opts.timeout ? new AbortController() : null // Lazy timeoutController, so we dont create object the user did not request, explicitly!
  const timeoutSignal = timeoutController?.signal

  const context = new Context(
    task,
    timeoutSignal// exposed to the user's test body (will abort on timeout or bail: env?.signal)
  )

  try {
    if (task.opts.skip) throw new Error(kSkip.description) // should this task be notified and returned already 🤔

    // Inherited Setup (Suites return [], Tests return hooks)
    for (const hook of task.beforeEach) await evaluate(hook, context, task.opts.timeout, timeoutController)

    // Block Execution (Works identical for describes and tests)
    if (task.fn) await env.wrap(task, () => evaluate(task.fn, context, task.opts.timeout, timeoutController))

    // Child Setup
    for (const hook of task.before) await evaluate(hook, context, task.opts.timeout, timeoutController)

    // Children (Single-pass optimization)
    let hasOnly = false
    for (let i = 0; i < task.children.length; i++) {
      if (task.children[i].opts.only) hasOnly = true
    }

    const runnable = []
    for (let i = 0; i < task.children.length; i++) {
      const child = task.children[i]
      if (hasOnly && !child.opts.only) child.skipped = true
      if (!child.skipped) runnable.push(child)
    }

    if (runnable.length > 0) {
      const iterator = runnable.values()
      await Promise.all(
        Array.from({ length: task.opts.concurrency === true ? runnable.length : task.opts.concurrency ?? 1 }, async () => {
          for (const child of iterator) {
            env?.notify?.(await run(child, env)) // we dont notify the root
          }
        })
      )
    }

    // Child Teardown
    for (const hook of task.after) await evaluate(hook, context, task.opts.timeout, timeoutController)

    // Inherited Teardown
    for (const hook of task.afterEach) await evaluate(hook, context, task.opts.timeout, timeoutController)
  } catch (error) {
    if (error.message === kSkip.description) task.skipped = true
    else task.error = error
  }
  // we have a try and catch, are we missing a finally?

  task.duration = Date.now() - start
  return task
}

export class Context {
  #mock = null

  constructor (node, signal) {
    this.node = node
    this.signal = signal
  }

  get mock () {
    return (this.#mock ??= createMock())
  }

  test (...args) {
    const child = new TestNode(...args)
    child.parent = this.node
    this.node.children.push(child)
    return child
  }

  skip (...args) {
    const child = new TestNode(...args)
    child.parent = this.node
    child.opts.skip = true
    this.node.children.push(child)
    return child
  }

  todo (...args) {
    const child = new TestNode(...args)
    child.parent = this.node
    child.opts.todo = true
    this.node.children.push(child)
    return child
  }
}

export class Node {
  constructor (name, optsOrFn, maybeFn) {
    this.name = name
    this.parent = null
    this.fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn
    this.opts = typeof optsOrFn === 'object' ? optsOrFn : {}
    this.children = []
    this.logs = []
    this.hooks = { before: [], after: [], beforeEach: [], afterEach: [] }

    // if (this.fn === undefined) {
    //   this.opts.todo = true
    // }
  }

  get before () { return this.hooks.before }

  get after () { return this.hooks.after }

  get beforeEach () { return [] }

  get afterEach () { return [] }
}

export class TestNode extends Node {
  get beforeEach () {
    const inherited = []
    let ancestor = this.parent
    while (ancestor) {
      if (ancestor.hooks.beforeEach.length) inherited.unshift(...ancestor.hooks.beforeEach)
      ancestor = ancestor.parent
    }
    return inherited
  }

  get afterEach () {
    const inherited = []
    let ancestor = this.parent
    while (ancestor) {
      if (ancestor.hooks.afterEach.length) inherited.push(...ancestor.hooks.afterEach)
      ancestor = ancestor.parent
    }
    return inherited
  }
}
