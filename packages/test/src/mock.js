/**
 * @file src/mock.js
 * Context holding the state and prototype methods for a specific spy.
 * Keeps V8 Hidden Classes perfectly stable.
 */
class SpyContext {
  constructor (implementation) {
    this.calls = []
    this.implementation = implementation
  }

  callCount () {
    return this.calls.length
  }

  resetCalls () {
    this.calls.length = 0
  }

  setImplementation (newImpl) {
    this.implementation = newImpl
  }

  restore () {} // Hook for tracker to override without changing object shape
}

/**
 * @file src/mock.js
 *
 * This module is a lightweight, drop-in replacement for the native Node.js `node:test` `mock` API.
 * It is fully compliant with core assertion patterns (calls tracking, arguments, results, errors, target contexts, and method restoration).
 *
 * ❌ DELIBERATE OMISSIONS (UNSUPPORTED FEATURES FOR PERFORMANCE & LEAN-DESIGN):
 *
 * 1. Call Stack Tracing (`calls[0].stack`)
 *    Native Node mocks can capture an `Error` stack trace on every single invocation. Creating a
 *    `new Error()` on every call is exceptionally slow and ruins hot-path execution.
 *
 * 2. The `times` Option
 *    Native `mock.fn` / `mock.method` allow passing `{ times: N }` to automatically restore
 *    or fall back after N executions. This requires tracking internal call counters and conditional
 *    branching inside the spy hot-path.
 *
 * 3. Property Getters & Setters (`mock.getter` / `mock.setter`)
 *    Native mocks support mocking property accessors. We omit these to avoid extra prototype
 *    descriptor lookup bloat.
 *
 * 4. Dual-behavior signatures on `mock.fn(original, implementation)`
 *    We simplify the factory signature to `fn(implementation)` to keep argument parsing fast.
 */

/**
 * Creates a standalone, high-performance spy function.
 *
 * @param {Function} [original] - The original implementation to wrap.
 * @returns {Function} The spy function.
 */

export const createSpy = (original = () => {}) => {
  const context = new SpyContext(original)

  const spy = function (...args) {
    const call = { arguments: args, result: undefined, error: undefined, target: this }
    context.calls.push(call)

    try {
      return (call.result = context.implementation.apply(this, args))
    } catch (error) {
      call.error = error
      throw error
    }
  }

  spy.mock = context
  return spy
}

class MockTracker {
  constructor () {
    this.activeSpies = []
  }

  fn (original) {
    return createSpy(original)
  }

  method (object, methodName, implementation) {
    if (!object || typeof object[methodName] !== 'function') {
      throw new Error(`Method "${methodName}" does not exist on target object`)
    }

    const original = object[methodName]
    const spy = createSpy(implementation || original)

    spy.mock.restore = () => { object[methodName] = original }

    this.activeSpies.push(spy.mock)
    object[methodName] = spy
    return spy
  }

  restoreAll () {
    // Single-pass, zero-allocation loop
    for (let i = 0; i < this.activeSpies.length; i++) {
      this.activeSpies[i].restore()
    }
    this.activeSpies.length = 0
  }
}

// Retain functional API compatibility for drop-in instantiation
export const createMock = () => new MockTracker()
