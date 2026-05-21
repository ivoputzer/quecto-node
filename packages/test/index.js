import { styleText } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'

const ctx = new AsyncLocalStorage()

// Poly-Signature Normalizer
const normalize = (fn, t) => new Promise((res, rej) => {
  try {
    if (!fn) return res()
    const result = fn(t, (err) => err ? rej(err) : res())
    if (result?.then) return result.then(res, rej)
    if (fn.length < 2) res()
  } catch (err) { rej(err) }
})

const buildNode = (name, optsOrFn, maybeFn) => ({
  name,
  fn: typeof optsOrFn === 'function' ? optsOrFn : maybeFn,
  opts: typeof optsOrFn === 'object' ? optsOrFn : {},
  children: [],
  before: [],
  after: []
})

async function runNode (node) {
  const start = Date.now()
  const t = {
    test: (...args) => { node.children.push(buildNode(...args)); return Promise.resolve() },
    skip: (name) => console.log(styleText('gray', `- ${name} (skipped)`))
  }

  try {
    // PHASE 1: Build the tree (evaluates the user's describe/test block to collect children and hooks)
    // If it's an `it()` block, this phase naturally just executes the test logic!
    await ctx.run(node, () => normalize(node.fn, t))

    // PHASE 2: Execute `before` hooks
    for (const b of node.before) await normalize(b, t)

    // PHASE 3: Pull-Based Matrix Engine
    if (node.children.length > 0) {
      const iter = node.children.entries()
      const concurrency = node.opts.concurrency === true ? 4 : (node.opts.concurrency || 1)
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let step = iter.next(); !step.done; step = iter.next()) await runNode(step.value[1])
      }))
    }

    // PHASE 4: Execute `after` hooks
    for (const a of node.after) await normalize(a, t)
  } catch (e) { node.error = e }

  node.duration = Date.now() - start
  return node
}

// The final 12-line reporter
function report (node, indent = '') {
  if (node.error) {
    process.exitCode = 1
    const trace = (node.error.stack || node.error).toString().replace(/\n/g, `\n${indent}    `)
    console.error(styleText('red', `${indent}✘ ${node.name} (${node.duration}ms)\n${indent}    ${trace}`))
  } else {
    // If it has children, it's a suite (▶). If it doesn't, it's a leaf node (✔).
    const icon = node.children.length ? 'blue' : 'green'
    const char = node.children.length ? '▶' : '✔'
    console.log(styleText(icon, `${indent}${char} ${node.name} (${node.duration}ms)`))

    // Recurse
    node.children.forEach(c => report(c, indent + '  '))
  }
}

export function test (...args) {
  const node = buildNode(...args)
  const parent = ctx.getStore()

  if (parent) { parent.children.push(node); return Promise.resolve() }
  return runNode(node).then(res => { report(res); return res })
}

export const describe = test
export const it = test
export const before = (fn) => ctx.getStore()?.before.push(fn)
export const after = (fn) => ctx.getStore()?.after.push(fn)
