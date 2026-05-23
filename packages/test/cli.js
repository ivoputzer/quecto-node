import * as cp from 'node:child_process'
import * as os from 'node:os'

import * as fs from './lib/fs.js'
import * as exports from './cli.js'

import { styleText, parseArgs } from 'node:util'

export const runFile = async (path, { register } = {}, { spawn } = cp, { execPath, execArgv } = process) => {
  const registerArgs = register ? ['--import', '@quecto/test/register'] : []
  const suite = spawn(execPath, [...execArgv, ...registerArgs, path], { stdio: 'inherit' })
  return new Promise((resolve, reject) => {
    suite.once('close', (code) => code === 0 ? resolve() : reject(path))
  })
}

export const defaultOptions = {
  match: '\\.?test\\.js$',
  ignore: '(^|\\/)(node_modules|\\.git)(\\/|$)',
}

export const mapOptions = (args, { availableParallelism } = os, { cwd } = process) => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      parallel: { short: 'p', type: 'string', default: `${availableParallelism()}` },
      match: { short: 'm', type: 'string', default: defaultOptions.match },
      ignore: { short: 'i', type: 'string', default: defaultOptions.ignore },
      register: { short: 'r', type: 'boolean', default: false },
      watch: { short: 'w', type: 'boolean', default: false }
    },
    allowPositionals: true
  })

  return {
    ...values,
    targets: positionals.length ? positionals : [cwd()],
    parallel: parseInt(values.parallel, 10),
    match: new RegExp(values.match),
    ignore: new RegExp(values.ignore)
  }
}

export const exitCode = (code, p = process) => { p.exitCode = code }

export async function runSuite ({ targets, parallel, match, ignore, register, watch }, { findFiles } = fs, { runFile, exitCode } = exports, { stdout, stderr } = process) {
  stdout.write(styleText(['blue', 'bold'], `\n@quecto/test » Igniting ${parallel} Cores\n\n`))
  try {
    const iter = findFiles(targets, match, ignore)
    await Promise.all(Array.from({ length: parallel }, async () => {
      for (let step = iter.next(); !step.done; step = iter.next()) {
        await runFile(step.value, { register })
      }
    }))
    stdout.write(styleText(['green', 'bold'], '\n✔ Test suite completely drained.\n\n'))
  } catch (failedFile) {
    exitCode(1)
    const msg = failedFile?.message || `${failedFile} failed to execute.`
    stderr.write(styleText(['red', 'bold'], `\n✘ Pipeline Failure: ${msg}\n\n`))
  }
}
