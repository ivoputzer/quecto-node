#!/usr/bin/env node

import cp from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import { styleText, parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { findFiles } from '../lib/fs.js'

const registerPath = fileURLToPath(new URL('../register.js', import.meta.url))

export const runFile = async (target, { register } = {}, { spawn } = cp, { execPath, execArgv } = process) => {
  const registerArgs = register ? ['--import', registerPath] : []
  const suite = spawn(execPath, [...execArgv, ...registerArgs, target], { stdio: 'inherit' })
  return new Promise((resolve, reject) => {
    suite.once('close', (code) => code === 0 ? resolve() : reject(target))
  })
}

export const defaultOptions = {
  match: '\\.test\\.js$',
  ignore: '(^|\\/)(node_modules|\\.git)(\\/|$)',
}

export const mapOptions = (args, { availableParallelism } = os, { cwd } = process) => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      parallel: { short: 'p', type: 'string', default: `${availableParallelism()}` },
      match: { short: 'm', type: 'string', default: defaultOptions.match },
      ignore: { short: 'i', type: 'string', default: defaultOptions.ignore },
      register: { short: 'r', type: 'boolean', default: false }
    },
    allowPositionals: true
  })

  return {
    ...values,
    targets: positionals.length ? positionals : [cwd()],
    // Bulletproof NaN fallback
    parallel: parseInt(values.parallel, 10) || availableParallelism(),
    match: new RegExp(values.match),
    ignore: new RegExp(values.ignore)
  }
}

export async function runSuite (opts, di = {}) {
  const { stdout = process.stdout, stderr = process.stderr } = di
  const setExitCode = di.exitCode || ((c) => { process.exitCode = c })
  const engine = di.runFile || runFile
  const finder = di.findFiles || findFiles

  stdout.write(styleText(['blue', 'bold'], `\n@quecto/test » Igniting ${opts.parallel} Cores\n\n`))
  try {
    const iter = finder(opts.targets, opts.match, opts.ignore)
    // Mathematically bounded worker pool to prevent empty allocation crashes
    await Promise.all(Array.from({ length: Math.max(1, opts.parallel) }, async () => {
      for (let step = iter.next(); !step.done; step = iter.next()) {
        await engine(step.value, { register: opts.register })
      }
    }))
    stdout.write(styleText(['green', 'bold'], '\n✔ Test suite completely drained.\n\n'))
  } catch (failedFile) {
    setExitCode(1)
    const msg = failedFile?.message || `${failedFile} failed to execute.`
    stderr.write(styleText(['red', 'bold'], `\n✘ Pipeline Failure: ${msg}\n\n`))
  }
}

// Ensure the CLI logic only executes when run directly (protects our test runner)
if (process.argv[1]?.includes('q-test')) {
  const { argv, exit, stdout, stderr } = process

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
    const { readFileSync } = fs
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    stdout.write(`v${version}\n`)
    exit(0)
  }

  try {
    await runSuite(mapOptions(argv.slice(2)))
    exit(0)
  } catch (error) {
    stderr.write(styleText(['red', 'bold'], `\n✘ Configuration Error: ${error.message}\n\n`))
    exit(1)
  }
}
