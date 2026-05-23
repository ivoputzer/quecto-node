#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { styleText } from 'node:util'
import { argv, exit, stdout, stderr } from 'node:process'
import { mapOptions, defaultOptions, runSuite } from '../cli.js'

if (argv.includes('--help') || argv.includes('-h')) {
  stdout.write(`
  Usage:
    q-test [targets...] [options]

  Aliases:
    npx @quecto/test [targets...] [options]

  Options:
    -p, --parallel <cores>  Number of parallel workers (default: os.availableParallelism)
    -m, --match <pattern>   RegExp pattern to filter test files (default: ${defaultOptions.match})
    -i, --ignore <pattern>  RegExp pattern to ignore directories (default: ${defaultOptions.ignore})
    -r, --register          Enable drop-in replacement for node:test (default: false)
    -v, --version           Print version and exit
    -h, --help              Print this help menu and exit
  \n`)
  exit(0)
}

if (argv.includes('--version') || argv.includes('-v')) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  stdout.write(`v${version}\n`)
  exit(0)
}

try {
  runSuite(mapOptions(argv.slice(2)))
} catch (error) {
  stderr.write(styleText(['red', 'bold'], `\n✘ Configuration Error: ${error.message}\n\n`))
  exit(1)
}
