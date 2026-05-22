#!/usr/bin/env node

import { parseCLI, runSuite } from './cli.js'

// the execution entrypoint. 0 logic, 100% DI orchestrator.
runSuite(parseCLI(process.argv.slice(2)))
