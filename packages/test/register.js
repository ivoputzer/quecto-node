import { registerHooks } from 'node:module'

registerHooks({
  resolve (specifier, context, next) {
    if (specifier === 'node:test') {
      return {
        shortCircuit: true,
        type: 'module',
        url: new URL('index.js', import.meta.url).href,
      }
    }
    return next(specifier, context)
  }
})
