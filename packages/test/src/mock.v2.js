/**
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

  // Hook for tracker to override without changing the object shape
  restore () {}
}

export const createSpy = (original = () => {}) => {
  const context = new SpyContext(original)

  const spy = function (...args) {
    const call = {
      arguments: args,
      result: undefined,
      error: undefined,
      target: this
    }
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

export class MockTracker {
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

    spy.mock.restore = () => {
      object[methodName] = original
    }

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
