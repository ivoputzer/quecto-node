import { styleText } from 'node:util'
import { createMock } from './mock.js'

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

export const resolveOptions = (optsOrFn, overrides) => typeof optsOrFn === 'function' ? overrides : { ...optsOrFn, ...overrides }

const kSkip = Symbol('quecto:test:skip')

// The pure, recursive, pull-based V8 micro-task
export async function run (task, env) {
  const start = Date.now()
  const ac = new AbortController()
  const context = new Context(task, ac?.signal)

  try {
    if (task.opts.skip) throw new Error(kSkip.description) // should this task be returned already 🤔

    // Inherited Setup (Suites return [], Tests return hooks)
    for (const hook of task.beforeEach) await evaluate(hook, context, task.opts.timeout, ac)

    // Block Execution (Works identical for describes and tests)
    if (task.fn) await env.wrap(task, () => evaluate(task.fn, context, task.opts.timeout, ac))

    // Child Setup
    for (const hook of task.before) await evaluate(hook, context, task.opts.timeout, ac)

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
      const length = task.opts.concurrency === true ? 8 : (task.opts.concurrency ?? 1)
      const iterator = runnable.values()
      await Promise.all(
        Array.from({ length }, async () => {
          for (const child of iterator) env?.notify?.(await run(child, env))
        })
      )
    }

    // Child Teardown
    for (const hook of task.after) await evaluate(hook, context, task.opts.timeout, ac)

    // Inherited Teardown
    for (const hook of task.afterEach) await evaluate(hook, context, task.opts.timeout, ac)
  } catch (error) {
    if (error.message === kSkip.description) task.skipped = true
    else task.error = error
  }

  task.duration = Date.now() - start
  return task
}

export function report (task, indent = '', { stdout, stderr, env } = process) {
  const pkgName = env.npm_package_name
  if (task.error) {
    env.QUECTO_TEST_EXIT_CODE = '1'
    const trace = (task.error.stack || task.error).toString().split('\n')
      .filter(line => !(pkgName && line.includes(pkgName)) && !line.includes('node:internal/'))
      .join(`\n${indent}    `)
    stderr.write(styleText('red', `${indent}✘ ${task.name} (${task.duration}ms)\n${indent}    ${trace}\n`))
  } else if (task.skipped) {
    stdout.write(styleText('gray', `${indent}- ${task.name} (skipped)\n`))
  } else {
    // Root Node is invisible. Only render its children.
    if (task.name !== 'QUECTO_ROOT_NODE') {
      const symbol = task.children.length ? '▶' : '✔'
      const color = task.children.length ? 'blue' : 'green'
      stdout.write(styleText(color, `${indent}${symbol} ${task.name} (${task.duration}ms)\n`))
      indent += '  '
    }
  }
  task.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
  task.children.forEach(child => report(child, indent, { stdout, stderr, env }))
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

  test (n, o, f) {
    const child = new TestNode(n, o, f)
    child.parent = this.node
    this.node.children.push(child)
    return child
  }

  skip (n, o, f) {
    const child = new TestNode(n, o, f)
    child.parent = this.node
    child.opts.skip = true
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
  }

  get before () {
    return this.hooks.before
  }

  get after () {
    return this.hooks.after
  }

  get beforeEach () {
    return []
  }

  get afterEach () {
    return []
  }
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
