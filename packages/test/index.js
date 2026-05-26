import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Node, TestNode, resolveOptions, run, report } from './src/test.js'
import { createMock } from './src/mock.js'

export const ctx = new AsyncLocalStorage()
export const rootNode = new Node('QUECTO_ROOT_NODE')

const originalLog = console.log
console.log = (...args) => {
  const task = ctx.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

export async function executeTree (root = rootNode, proc = process) {
  const matrixCtx = { run: (store, cb) => ctx.run(store, cb) }
  return run(root, matrixCtx).then(result => {
    report(result, '', proc)
    if (proc.env.QUECTO_TEST_EXIT_CODE) proc.exitCode = 1
    return result
  })
}

// PURE AST MOUNTER
function addNode (node) {
  const parent = ctx.getStore() || rootNode // when does || rootNode trigger?
  node.parent = parent
  parent.children.push(node)
  return node // Pure, synchronous data. No hidden promises.
}

export const test = (n, o, f) => addNode(new TestNode(n, o, f)) // should this use resolveOptions?
export const describe = (n, o, f) => addNode(new Node(n, o, f)) // should this use resolveOptions?
export const it = test

test.skip = (n, o, f) => addNode(new TestNode(n, resolveOptions(o, { skip: true }), f || o))
test.only = (n, o, f) => addNode(new TestNode(n, resolveOptions(o, { only: true }), f || o))
describe.skip = (n, o, f) => addNode(new Node(n, resolveOptions(o, { skip: true }), f || o))
describe.only = (n, o, f) => addNode(new Node(n, resolveOptions(o, { only: true }), f || o))

export const before = (fn) => (ctx.getStore() || rootNode).hooks.before.push(fn)
export const after = (fn) => (ctx.getStore() || rootNode).hooks.after.push(fn)
export const beforeEach = (fn) => (ctx.getStore() || rootNode).hooks.beforeEach.push(fn)
export const afterEach = (fn) => (ctx.getStore() || rootNode).hooks.afterEach.push(fn)

export const mock = createMock()

setImmediate(() => {
  if (rootNode.children.length > 0) executeTree(rootNode)
})
