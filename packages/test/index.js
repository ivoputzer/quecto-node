import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Node, TestNode, resolveOptions, run } from './src/test.js'
import { createMock } from './src/mock.js'
import { text } from './src/reporter.js'

export const als = new AsyncLocalStorage()
export const rootNode = new Node('QUECTO_ROOT_NODE')

const originalLog = console.log
console.log = (...args) => {
  const task = als.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

export async function executeTree (node = rootNode, process) {
  const bailController = new AbortController() // this is gonna be used by bail mechanics later
  return run(node, {
    wrap: (store, cb) => als.run(store, cb),
    notify: Function.prototype,
    signal: bailController.signal
  })
    .then(result => {
      text(result, '', process)
      if (process.env.QUECTO_TEST_EXIT_CODE) process.exitCode = 1
      return result
    })
}

function addNode (node) {
  const parent = als.getStore() ?? rootNode
  node.parent = parent
  parent.children.push(node)
  return node
}

export const test = (n, o, f) => addNode(new TestNode(n, o, f))
export const describe = (n, o, f) => addNode(new Node(n, o, f))
export const it = test

test.skip = (n, o, f) => addNode(new TestNode(n, resolveOptions(o, { skip: true }), f ?? o))
test.only = (n, o, f) => addNode(new TestNode(n, resolveOptions(o, { only: true }), f ?? o))
describe.skip = (n, o, f) => addNode(new Node(n, resolveOptions(o, { skip: true }), f ?? o))
describe.only = (n, o, f) => addNode(new Node(n, resolveOptions(o, { only: true }), f ?? o))

export const before = (fn) => (als.getStore() ?? rootNode).hooks.before.push(fn)
export const after = (fn) => (als.getStore() ?? rootNode).hooks.after.push(fn)
export const beforeEach = (fn) => (als.getStore() ?? rootNode).hooks.beforeEach.push(fn)
export const afterEach = (fn) => (als.getStore() ?? rootNode).hooks.afterEach.push(fn)

export const mock = createMock()

/*
  This needs to be the run function like node:test is exporting in future

  options should align with node:test .run function thus {
    files:string[],
    globPattern:string[],
    bail:boolean,
    concurrency:number|boolean, <--- this is what we call parallelism
    timeout:number,
    signal:AbortSignal,
    watch, <-- we said we're going to deprecate this
    shard <-- we wont implement this either
  }
*/
export async function * stream (options, root = rootNode) {
  const q = []
  const w = []
  const notify = (x) => w.length ? w.shift()(x) : q.push(x)

  run(root, { notify, wrap: (store, cb) => als.run(store, cb) })
    .finally(() => notify(null))

  while (true) {
    const item = q.length ? q.shift() : await new Promise(resolve => w.push(resolve))
    if (item === null) break
    yield item
  }
}

setImmediate(() => {
  if (rootNode.children.length > 0) executeTree(rootNode, process)
})
