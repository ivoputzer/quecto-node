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

// export const createTest = (name, optsOrFn, maybeFn) => ({
//   name,
//   parent: null,
//   isSuite: false, // The only flag we need!
//   fn: typeof optsOrFn === 'function' ? optsOrFn : maybeFn,
//   opts: typeof optsOrFn === 'object' ? optsOrFn : {},
//   children: [],
//   logs: [],
//   hooks: {
//     before: [],
//     after: [],
//     beforeEach: [],
//     afterEach: []
//   },
//   get before () {
//     return this.hooks.before
//   },
//   get after () {
//     return this.hooks.after
//   },
//   get beforeEach () {
//     if (this.isSuite) return [] // 💥 BOOM. I am a folder. I do not inherit.
//     const inherited = []
//     let ancestor = this.parent
//     while (ancestor) {
//       if (ancestor.hooks.beforeEach.length) inherited.unshift(...ancestor.hooks.beforeEach)
//       ancestor = ancestor.parent
//     }
//     return inherited
//   },
//   get afterEach () {
//     if (this.isSuite) return [] // 💥 BOOM. I am a folder.
//     const inherited = []
//     let ancestor = this.parent
//     while (ancestor) {
//       if (ancestor.hooks.afterEach.length) inherited.push(...ancestor.hooks.afterEach)
//       ancestor = ancestor.parent
//     }
//     return inherited
//   }
// })

export const resolveOptions = (optsOrFn, overrides) => typeof optsOrFn === 'function' ? overrides : { ...optsOrFn, ...overrides }

// The pure, recursive, pull-based V8 micro-task
export async function run (task, ctx) {
  const start = Date.now()
  const ac = new AbortController()
  const context = new Context(task, ac?.signal)

  // const context = {
  //   signal: ac?.signal,
  //   get mock () {
  //     if (!mock) {
  //       mock = createMock()
  //     }
  //     return mock
  //   },
  //   test: (...args) => {
  //     const child = new TestNode(...args)
  //     child.parent = task
  //     task.children.push(child)
  //     return Promise.resolve()
  //   },
  //   skip: (...args) => {
  //     const child = new TestNode(...args)
  //     child.parent = task
  //     child.opts.skip = true
  //     task.children.push(child)
  //     return Promise.resolve()
  //   }
  // }

  try {
    if (task.opts.skip) throw new Error('ERR_SKIPPED')

    // 1. Inherited Setup (Suites return [], Tests return hooks)
    for (const hook of task.beforeEach) await evaluate(hook, context, task.opts.timeout, ac)

    // 2. Block Execution (Works identical for describes and tests!)
    if (task.fn) await ctx.run(task, () => evaluate(task.fn, context, task.opts.timeout, ac))

    // 3. Child Setup
    for (const hook of task.before) await evaluate(hook, context, task.opts.timeout, ac)

    // 4. Children Matrix
    const exclusive = task.children.filter(c => c.opts.only)
    if (exclusive.length) task.children.forEach(c => { if (!c.opts.only) c.skipped = true })
    const runnable = task.children.filter(c => !c.skipped)

    if (runnable.length > 0) {
      const poolSize = task.opts.concurrency === true ? 8 : (task.opts.concurrency || 1)
      const iterator = runnable.entries()
      await Promise.all(
        Array.from({ length: poolSize }, async () => {
          for (let step = iterator.next(); !step.done; step = iterator.next()) {
            await run(step.value[1], ctx)
          }
        })
      )
    }

    // 5. Child Teardown
    for (const hook of task.after) await evaluate(hook, context, task.opts.timeout, ac)

    // 6. Inherited Teardown
    for (const hook of task.afterEach) await evaluate(hook, context, task.opts.timeout, ac)
  } catch (error) {
    if (error.message === 'ERR_SKIPPED') task.skipped = true
    else task.error = error
  }

  task.duration = Date.now() - start
  return task
}

// export function report (task, indent = '', { stdout, stderr, env } = process) {
//   const pkgName = env.npm_package_name
//   if (task.error) {
//     env.QUECTO_TEST_EXIT_CODE = '1'
//     const trace = (task.error.stack || task.error).toString().split('\n')
//       .filter(line => !(pkgName && line.includes(pkgName)) && !line.includes('node:internal/'))
//       .join(`\n${indent}    `)
//     stderr.write(styleText('red', `${indent}✘ ${task.name} (${task.duration}ms)\n${indent}    ${trace}\n`))
//   } else if (task.skipped) {
//     stdout.write(styleText('gray', `${indent}- ${task.name} (skipped)\n`))
//   } else {
//     // Root Node is invisible. Only render its children.
//     if (task.name !== 'QUECTO_ROOT_NODE') {
//       const symbol = task.children.length ? '▶' : '✔'
//       const color = task.children.length ? 'blue' : 'green'
//       stdout.write(styleText(color, `${indent}${symbol} ${task.name} (${task.duration}ms)\n`))
//       indent += '  '
//     }
//   }
//   task.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
//   task.children.forEach(child => report(child, indent, { stdout, stderr, env }))
// }

export class Context {
  #mock = null

  constructor (node, signal) {
    this.node = node
    this.signal = signal
  }

  get mock () {
    if (!this.#mock) this.#mock = createMock()
    return this.#mock
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

export function report (node, indent = '', proc = process, stats = { tests: 0, suites: 0, pass: 0, fail: 0, skip: 0 }) {
  const { stdout, stderr, env } = proc
  const isRoot = node.name === 'QUECTO_ROOT_NODE'

  if (!isRoot) {
    if (node instanceof TestNode) stats.tests++
    else stats.suites++

    if (node.error) {
      stats.fail++
      if (env) env.QUECTO_TEST_EXIT_CODE = '1'
      const pkg = env?.npm_package_name
      const trace = (node.error.stack || node.error).toString().split('\n')
        .filter(line => !(pkg && line.includes(pkg)) && !line.includes('node:internal/'))
        .join(`\n${indent}    `)
      stderr.write(styleText('red', `${indent}✘ ${node.name} (${node.duration}ms)\n${indent}    ${trace}\n`))
    } else if (node.skipped) {
      stats.skip++
      stdout.write(styleText('gray', `${indent}- ${node.name} (skipped)\n`))
    } else {
      stats.pass++
      const symbol = node.children.length ? '▶' : '✔'
      const color = node.children.length ? 'blue' : 'green'
      stdout.write(styleText(color, `${indent}${symbol} ${node.name} (${node.duration}ms)\n`))
    }
    indent += '  '
  }

  node.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
  node.children.forEach(child => report(child, indent, proc, stats))

  // Print the summary exactly once, right at the bottom
  if (isRoot) {
    stdout.write(`
${styleText('blue', 'ℹ')} tests ${stats.tests}
${styleText('blue', 'ℹ')} suites ${stats.suites}
${styleText('green', 'ℹ')} pass ${stats.pass}
${styleText(stats.fail ? 'red' : 'gray', 'ℹ')} fail ${stats.fail}
${styleText('gray', 'ℹ')} skip ${stats.skip}\n\n`)
  }
}
