import { format } from 'node:util'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Node, TestNode, resolveOptions, run, report } from './src/test.js'
import { createMock } from './src/mock.js'

export const als = new AsyncLocalStorage()
export const rootNode = new Node('QUECTO_ROOT_NODE')

const originalLog = console.log
console.log = (...args) => {
  const task = als.getStore()
  if (task) task.logs.push(format(...args))
  else originalLog(...args)
}

export async function executeTree (root = rootNode, proc = process) {
  return run(root, {
    notify: (task) => { /* [TODO] Reporter|Ipc */ },
    wrap: (store, cb) => als.run(store, cb),
  })
    .then(result => {
      report(result, '', proc)
      if (proc.env.QUECTO_TEST_EXIT_CODE) proc.exitCode = 1
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

setImmediate(() => {
  if (rootNode.children.length > 0) executeTree(rootNode)
})
