import { styleText, format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'

const ctx = new AsyncLocalStorage()
const pkgName = process.env.npm_package_name

const originalLog = console.log
console.log = (...args) => {
  const node = ctx.getStore()
  if (node) node.logs.push(format(...args))
  else originalLog(...args)
}

// DI-ready normalizer with AbortController for timeouts
const normalize = (fn, t, timeout, ac, { setTimer = setTimeout, clrTimer = clearTimeout } = {}) =>
  new Promise((res, rej) => {
    let timer
    const done = (err) => {
      if (timer) clrTimer(timer)
      err ? rej(err) : res()
    }
    if (timeout) {
      timer = setTimer(() => {
        const err = new Error(`Timeout: ${timeout}ms exceeded`)
        // t.signal?.abort(err) // Kills background user-tasks
        ac?.abort(err)
        done(err)
      }, timeout)
    }

    try {
      if (!fn) return done()
      const result = fn(t, done)
      if (result?.then) result.then(() => done(), done)
      else if (fn.length < 2) done()
    } catch (err) { done(err) }
  })

const buildNode = (name, optsOrFn, maybeFn) => ({
  name,
  fn: typeof optsOrFn === 'function' ? optsOrFn : maybeFn,
  opts: typeof optsOrFn === 'object' ? optsOrFn : {},
  children: [],
  before: [],
  after: [],
  logs: []
})

const buildOpts = (optsOrFn, extra) => typeof optsOrFn === 'function' ? extra : { ...optsOrFn, ...extra }

async function runNode (node) {
  const start = Date.now()
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null

  const t = {
    signal: ac?.signal,
    test: (...args) => { node.children.push(buildNode(...args)); return Promise.resolve() },
    skip: (...args) => { const n = buildNode(...args); n.opts.skip = true; node.children.push(n); return Promise.resolve() }
  }

  try {
    if (node.opts.skip) throw new Error('ERR_SKIPPED')
    await ctx.run(node, () => normalize(node.fn, t, node.opts.timeout, ac))
    for (const b of node.before) await normalize(b, t, node.opts.timeout, ac)

    const onlys = node.children.filter(c => c.opts.only)
    if (onlys.length) node.children.forEach(c => { if (!c.opts.only) c.skipped = true })
    const runnable = node.children.filter(c => !c.skipped)

    if (runnable.length > 0) {
      const iter = runnable.entries()
      const concurrency = node.opts.concurrency === true ? 4 : (node.opts.concurrency || 1)
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let step = iter.next(); !step.done; step = iter.next()) await runNode(step.value[1])
      }))
    }
    for (const a of node.after) await normalize(a, t, node.opts.timeout, ac)
  } catch (e) {
    if (e.message === 'ERR_SKIPPED') node.skipped = true
    else node.error = e
  }

  node.duration = Date.now() - start
  return node
}

// DI-ready reporter
function report (node, indent = '', { out = process.stdout.write.bind(process.stdout), errOut = process.stderr.write.bind(process.stderr), env = process.env } = {}) {
  const pName = env.npm_package_name
  if (node.error) {
    env.M_TEST_EXIT_CODE = '1'
    const trace = (node.error.stack || node.error).toString().split('\n')
      .filter(l => !(pName && l.includes(pName)) && !l.includes('node:internal/')).join(`\n${indent}    `)
    errOut(styleText('red', `${indent}✘ ${node.name} (${node.duration}ms)\n${indent}    ${trace}\n`))
  } else if (node.skipped) {
    out(styleText('gray', `${indent}- ${node.name} (skipped)\n`))
  } else {
    out(styleText(node.children.length ? 'blue' : 'green', `${indent}${node.children.length ? '▶' : '✔'} ${node.name} (${node.duration}ms)\n`))
  }
  node.logs.forEach(log => out(styleText('gray', `${indent}  | ${log.replace(/\n/g, `\n${indent}  | `)}\n`)))
  node.children.forEach(c => report(c, indent + '  ', { out, errOut, env }))
}

export function test (...args) {
  const node = buildNode(...args)
  const parent = ctx.getStore()
  if (parent) { parent.children.push(node); return Promise.resolve() }
  return runNode(node).then(res => { report(res); if (process.env.M_TEST_EXIT_CODE) process.exitCode = 1; return res })
}

test.only = (n, o, f) => test(n, buildOpts(o, { only: true }), f || o)
test.skip = (n, o, f) => test(n, buildOpts(o, { skip: true }), f || o)
export const describe = test
export const it = test
export const before = (fn) => ctx.getStore()?.before.push(fn)
export const after = (fn) => ctx.getStore()?.after.push(fn)

// Export for Unit Tests only
export const _internals = { normalize, buildNode, buildOpts, runNode, report }
