import { styleText } from 'node:util'

export const evaluate = (fn, context, timeout, abortController, { setTimeout, clearTimeout } = globalThis) =>
  new Promise((resolve, reject) => {
    let timer
    const finalize = (err) => {
      if (timer) clearTimeout(timer)
      err ? reject(err) : resolve()
    }

    if (timeout) {
      timer = setTimeout(() => {
        const err = new Error(`Timeout: ${timeout}ms exceeded`)
        abortController?.abort(err)
        finalize(err)
      }, timeout)
    }

    try {
      if (!fn) return finalize()
      const result = fn(context, finalize)
      if (result?.then) result.then(() => finalize(), finalize)
      else if (fn.length < 2) finalize()
    } catch (err) { finalize(err) }
  })

export const createTask = (name, optsOrFn, maybeFn) => ({
  name,
  fn: typeof optsOrFn === 'function' ? optsOrFn : maybeFn,
  opts: typeof optsOrFn === 'object' ? optsOrFn : {},
  children: [],
  before: [],
  after: [],
  logs: []
})

export const resolveOptions = (optsOrFn, overrides) =>
  typeof optsOrFn === 'function' ? overrides : { ...optsOrFn, ...overrides }

// The pure, recursive, pull-based V8 micro-task
export async function run (task, ctx) {
  const start = Date.now()
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null

  const context = {
    signal: ac?.signal,
    test: (...args) => {
      const child = createTask(...args)
      child.parent = task
      task.children.push(child)
      return Promise.resolve()
    },
    skip: (...args) => {
      const child = createTask(...args)
      child.parent = task
      child.opts.skip = true
      task.children.push(child)
      return Promise.resolve()
    }
  }

  try {
    if (task.opts.skip) throw new Error('ERR_SKIPPED')

    for (const hook of task.before) await evaluate(hook, context, task.opts.timeout, ac)

    // Evaluates test assertions. (For suites, task.fn is null, so this bypasses cleanly)
    await ctx.run(task, () => evaluate(task.fn, context, task.opts.timeout, ac))

    const exclusive = task.children.filter(c => c.opts.only)
    if (exclusive.length) task.children.forEach(c => { if (!c.opts.only) c.skipped = true })
    const runnable = task.children.filter(c => !c.skipped)

    if (runnable.length > 0) {
      const poolSize = task.opts.concurrency === true ? 4 : (task.opts.concurrency || 1)
      const iterator = runnable.entries()
      await Promise.all(Array.from({ length: poolSize }, async () => {
        for (let step = iterator.next(); !step.done; step = iterator.next()) {
          await run(step.value[1], ctx)
        }
      }))
    }

    for (const hook of task.after) await evaluate(hook, context, task.opts.timeout, ac)
  } catch (error) {
    if (error.message === 'ERR_SKIPPED') task.skipped = true
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
