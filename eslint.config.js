import neostandard, { plugins, resolveIgnoresFromGitignore } from 'neostandard'

export default [
  {
    ignores: [
      '**/node_modules/**',
      'node_modules/**',
    ]
  },
  ...neostandard({
    ignores: resolveIgnoresFromGitignore()
  }),
  plugins.n.configs['flat/recommended'],
]
