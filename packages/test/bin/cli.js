/*

  [ THIS SHOULD BE MOVED TO SOMEWHERE ELSE ]

  cli.js should be the name of the binary bin/cli.js not the library

  I feel like those functions should kinda live together 🤔

  runFile
  runSuite
  runNode

  fs.findFiles
  cli.parseArgs

*/
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as cp from 'node:child_process'
import { styleText, parseArgs } from 'node:util'
import { availableParallelism } from 'node:os'

export function * findFiles (base, filter, { readdirSync } = fs, { join } = path) {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const fullPath = join(base, entry.name)
    if (entry.isDirectory()) {
      yield * findFiles(fullPath, filter, { readdirSync }, { join })
    } else if (filter.test(fullPath)) {
      yield fullPath
    }
  }
}

// Injects the loader dynamically AND respects inherited node flags (like --no-warnings)
export const runFile = (file, { register } = {}, { spawn } = cp, { execPath, execArgv } = process) =>
  new Promise((resolve, reject) => {
    const args = [...execArgv]
    if (register && !args.includes('@quecto/test/register')) {
      args.push('--import', '@quecto/test/register')
    }
    args.push(file)

    const proc = spawn(execPath, args, { stdio: 'inherit' })
    proc.on('close', (code) => code === 0 ? resolve() : reject(file))
  })

// Extracts CLI arguments purely
export const parseCLI = (args, { parallelism = availableParallelism } = {}) => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      parallel: { type: 'string', short: 'p' },
      match: { type: 'string', short: 'm' },
      register: { type: 'boolean', short: 'r' }
    },
    allowPositionals: true
  })

  return {
    dir: positionals[0] || 'test',
    concurrency: parseInt(values.parallel, 10) || parallelism(),
    filter: values.match ? new RegExp(values.match) : /\.test\.js$/,
    register: values.register || false
  }
}

// The multi-core engine
export async function runSuite ({ dir, concurrency, filter, register }, { _find = findFiles, _run = runFile, _log = console.log, _err = console.error, _proc = process } = {}) {
  _log(styleText(['blue', 'bold'], `\n@quecto/test » Igniting ${concurrency} Cores\n`))
  const iter = _find(dir, filter)

  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let step = iter.next(); !step.done; step = iter.next()) {
        await _run(step.value, { register })
      }
    }))
    _log(styleText(['green', 'bold'], '\n✔ Test suite completely drained.\n'))
  } catch (failedFile) {
    _proc.exitCode = 1
    _err(styleText(['red', 'bold'], `\n✘ Pipeline Failure: ${failedFile} failed to execute.\n`))
  }
}
