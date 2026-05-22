import { styleText, format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'

const ctx = new AsyncLocalStorage()
const pkgName = process.env.npm_package_name

// 1. Concurrent Console Capture
const originalLog = console.log
console.log = (...args) => {
  const node = ctx.getStore()
  if (node) node.logs.push(format(...args))
  else originalLog(...args)
}

// 2. Timeout & Execution Normalizer
const normalize = (fn, t, timeout) => new Promise((res, rej) => {
  let timer
  const done = (err) => {
    if (timer) clearTimeout(timer)
    err ? rej(err) : res()
  }
  if (timeout) timer = setTimeout(() => done(new Error(`Timeout: ${timeout}ms exceeded`)), timeout)

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

// 3. The Concurrency Matrix
async function runNode (node) {
  const start = Date.now()
  const t = {
    test: (...args) => { node.children.push(buildNode(...args)); return Promise.resolve() },
    skip: (...args) => { const n = buildNode(...args); n.opts.skip = true; node.children.push(n); return Promise.resolve() }
  }

  try {
    if (node.opts.skip) throw new Error('ERR_SKIPPED')
    await ctx.run(node, () => normalize(node.fn, t, node.opts.timeout))
    for (const b of node.before) await normalize(b, t, node.opts.timeout)

    const onlys = node.children.filter(c => c.opts.only)
    const runnable = onlys.length ? onlys : node.children

    if (runnable.length > 0) {
      const iter = runnable.entries()
      const concurrency = node.opts.concurrency === true ? 4 : (node.opts.concurrency || 1)
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let step = iter.next(); !step.done; step = iter.next()) await runNode(step.value[1])
      }))
    }
    for (const a of node.after) await normalize(a, t, node.opts.timeout)
  } catch (e) {
    if (e.message === 'ERR_SKIPPED') node.skipped = true
    else node.error = e
  }

  node.duration = Date.now() - start
  return node
}

// 4. The Stdout Atomic Reporter
function report (node, indent = '') {
  const out = (str) => process.stdout.write(str + '\n')
  const errOut = (str) => process.stderr.write(str + '\n')

  if (node.error) {
    process.exitCode = 1
    const trace = (node.error.stack || node.error).toString()
      .split('\n')
      .filter(l => !(pkgName && l.includes(pkgName)) && !l.includes('node:internal/'))
      .join(`\n${indent}    `)
    errOut(styleText('red', `${indent}✘ ${node.name} (${node.duration}ms)\n${indent}    ${trace}`))
  } else if (node.skipped) {
    out(styleText('gray', `${indent}- ${node.name} (skipped)`))
  } else {
    const char = node.children.length ? '▶' : '✔'
    const color = node.children.length ? 'blue' : 'green'
    out(styleText(color, `${indent}${char} ${node.name} (${node.duration}ms)`))
  }

  node.logs.forEach(log => out(styleText('gray', `${indent}  | ${log.replace(/\n/g, `\n${indent}  | `)}`)))
  node.children.forEach(c => report(c, indent + '  '))
}

// 5. The API Surface
export function test (...args) {
  const node = buildNode(...args)
  const parent = ctx.getStore()
  if (parent) { parent.children.push(node); return Promise.resolve() }
  return runNode(node).then(res => { report(res); return res })
}

const buildOpts = (optsOrFn, extra) => typeof optsOrFn === 'function' ? extra : { ...optsOrFn, ...extra }
test.only = (n, o, f) => test(n, buildOpts(o, { only: true }), f || o)
test.skip = (n, o, f) => test(n, buildOpts(o, { skip: true }), f || o)

export const describe = test
export const it = test
export const before = (fn) => ctx.getStore()?.before.push(fn)
export const after = (fn) => ctx.getStore()?.after.push(fn)
