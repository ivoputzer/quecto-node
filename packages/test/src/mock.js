/**
 * @file lib/mock.js
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
  const calls = []
  let implementation = original

  const spy = function (...args) {
    const call = {
      arguments: args,
      result: undefined,
      error: undefined,
      target: this
    }
    calls.push(call)

    try {
      return (call.result = implementation.apply(this, args))
    } catch (error) {
      call.error = error
      throw error
    }
  }

  spy.mock = {
    calls,
    callCount () {
      return calls.length
    },
    resetCalls () {
      calls.length = 0
    },
    setImplementation (newImpl) {
      implementation = newImpl
    }
  }

  return spy
}

/**
 * Factory that returns a mock context.
 * Useful for context-local mock tracking and automatic cleanup.
 */
export const createMock = () => {
  const activeSpies = []

  return {
    fn: createSpy,

    method (object, methodName, implementation) {
      if (!object || typeof object[methodName] !== 'function') {
        throw new Error(`Method "${methodName}" does not exist on target object`)
      }

      const original = object[methodName]
      const spy = createSpy(implementation ?? original)

      spy.mock.restore = () => {
        object[methodName] = original
      }

      // Track this spy so we can restore it in restoreAll()
      activeSpies.push(spy.mock)

      object[methodName] = spy
      return spy
    },

    restoreAll () {
      for (const m of activeSpies) {
        m.restore?.()
      }
      activeSpies.length = 0
    }
  }
}
