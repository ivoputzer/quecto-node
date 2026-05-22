import { registerHooks } from 'node:module'

/*
  [ registerHooks ]

  Allows us to overwrite imports of 'node:test' and inject '@quecto/test' dynamically!

  This means we wont have to update our source code in order to use this new test runner,
  we're only required to update they way we execute them:

  node --test test.js
  node --import @quecto/test/register test.js

  [Note]

  While this is very handy it will drastically degrade performance!
*/

registerHooks({
  resolve (specifier, context, next) {
    if (specifier === 'node:test') {
      return {
        type: 'module',
        shortCircuit: true,
        url: new URL('index.js', import.meta.url).href,
      }
    }
    return next(specifier, context)
  }
})
