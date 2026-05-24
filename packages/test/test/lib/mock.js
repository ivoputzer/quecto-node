import { describe, it } from 'node:test'
import { strictEqual, throws, ok, fail } from 'node:assert'
import { createMock, createSpy } from '../../lib/mock.js' // Adjust path accordingly

describe('lib/mock', () => {
  describe('createSpy()', () => {
    it('captures arguments and successful return values', () => {
      const spy = createSpy((a, b) => a + b)

      const result = spy(10, 20)

      strictEqual(result, 30)
      strictEqual(spy.mock.callCount(), 1)
      strictEqual(spy.mock.calls[0].arguments[0], 10)
      strictEqual(spy.mock.calls[0].arguments[1], 20)
      strictEqual(spy.mock.calls[0].result, 30)
    })

    it('captures thrown errors and propagates them', () => {
      const expectedError = new Error('Failure')
      const spy = createSpy(() => { throw expectedError })

      throws(() => spy(), /Failure/)

      strictEqual(spy.mock.callCount(), 1)
      strictEqual(spy.mock.calls[0].error, expectedError)
    })

    it('preserves the "this" context', () => {
      const spy = createSpy(function () { return this.value })
      const ctx = { value: 'context-value', spy }

      const result = ctx.spy()

      strictEqual(result, 'context-value')
      strictEqual(spy.mock.calls[0].target, ctx)
    })

    it('allows resetting calls and changing implementation', () => {
      const spy = createSpy(() => 'first')
      strictEqual(spy(), 'first')

      spy.mock.setImplementation(() => 'second')
      spy.mock.resetCalls()

      strictEqual(spy.mock.callCount(), 0)
      strictEqual(spy(), 'second')
      strictEqual(spy.mock.callCount(), 1)
    })
  })

  describe('createMock()', () => {
    it('can spy on object methods and restore them', () => {
      const tracker = createMock()
      const target = {
        greet (name) { return `Hello, ${name}` }
      }

      const spy = tracker.method(target, 'greet', (name) => `Hi, ${name}`)

      strictEqual(target.greet('Alice'), 'Hi, Alice')
      strictEqual(spy.mock.callCount(), 1)

      spy.mock.restore()

      strictEqual(target.greet('Alice'), 'Hello, Alice')
    })

    it('restoreAll() restores all patched methods in this tracker', () => {
      const tracker = createMock()
      const api = {
        fetchData: () => 'original-data',
        saveData: () => 'original-save'
      }

      tracker.method(api, 'fetchData', () => 'mock-data')
      tracker.method(api, 'saveData', () => 'mock-save')

      strictEqual(api.fetchData(), 'mock-data')
      strictEqual(api.saveData(), 'mock-save')

      tracker.restoreAll()

      strictEqual(api.fetchData(), 'original-data')
      strictEqual(api.saveData(), 'original-save')
    })

    it('throws if trying to mock a non-existent method', () => {
      const tracker = createMock()
      const target = {}

      throws(() => {
        tracker.method(target, 'invalidMethod')
      }, /Method "invalidMethod" does not exist on target object/)
    })
  })

  describe('Mock API Compliance (deliberate omissions)', () => {
    // 1. The 'times' option
    it.skip('supports the "times" option to automatically fall back to original behavior', () => {
      const tracker = createMock()
      const target = {
        compute: (a) => a * 2
      }

      // Mock should only run 2 times, then fall back to original double behavior
      tracker.method(target, 'compute', (a) => a + 10, { times: 2 })

      strictEqual(target.compute(2), 12) // Call 1 (Mocked)
      strictEqual(target.compute(2), 12) // Call 2 (Mocked)
      strictEqual(target.compute(2), 4)  // Call 3 (Restored/Original!)
    })

    // 2. Property Getters
    it.skip('supports mock.getter() to spy on and mock property getters', () => {
      const tracker = createMock()
      const config = {
        get port () { return 3000 }
      }

      const spy = tracker.getter(config, 'port', () => 8080)

      strictEqual(config.port, 8080)
      strictEqual(spy.mock.callCount(), 1)

      spy.mock.restore()
      strictEqual(config.port, 3000)
    })

    // 3. Property Setters
    it.skip('supports mock.setter() to spy on and mock property setters', () => {
      const tracker = createMock()
      let savedVal = null
      const config = {
        get value () {},
        set value (val) { savedVal = val }
      }

      let mockSavedVal = null
      const spy = tracker.setter(config, 'value', (val) => { mockSavedVal = val })

      config.value = 'test-value'

      strictEqual(mockSavedVal, 'test-value')
      strictEqual(savedVal, null) // Original setter should not have been called
      strictEqual(spy.mock.callCount(), 1)

      spy.mock.restore()
      config.value = 'original-value'
      strictEqual(savedVal, 'original-value')
    })

    // 4. Call Stack Traces
    it.skip('captures an Error stack trace on every call inside calls[0].stack', () => {
      const tracker = createMock()
      const spy = tracker.fn()

      spy()

      const callRecord = spy.mock.calls[0]
      ok(callRecord.stack instanceof Error, 'Should capture a stack error')
      ok(callRecord.stack.stack.includes('mock_compliance.test.js'), 'Stack should trace back to this file')
    })
  })
})
