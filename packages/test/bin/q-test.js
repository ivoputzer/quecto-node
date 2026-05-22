#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { exit } from 'node:process'

import { parseCLI, runSuite } from './cli.js'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Usage:
    quecto [targets...] [options]

  Options:
    -p, --parallel <cores>  Number of parallel workers (default: CPU cores)
    -m, --match <pattern>   RegExp pattern to filter test files (default: /\.test\.js$/)
    -r, --register          Enable drop-in replacement for node:test (degrades performance slightly)
    -v, --version           Print version and exit
    -h, --help              Print this help menu and exit
  `)
  exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  const pkgPath = new URL('../package.json', import.meta.url)
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  console.log(`v${pkg.version}`)
  exit(0)
}

// the execution entrypoint. 0 logic, 100% DI orchestrator
runSuite(parseCLI(args))
