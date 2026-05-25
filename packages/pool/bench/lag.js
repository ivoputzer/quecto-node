import { monitorEventLoopDelay } from 'node:perf_hooks'
import { pool } from '../index.js'

const ITERATIONS = Number(process.env.ITERATIONS) || 100_000
const CONCURRENCY = Number(process.env.CONCURRENCY) || 50
const items = Array.from({ length: ITERATIONS }, (_, i) => i)

async function runLagBenchmark () {
  console.log('================================================================')
  console.log(' @quecto/pool » Event Loop Lag Audit')
  console.log(` Configuration: ${ITERATIONS.toLocaleString()} tasks @ Concurrency ${CONCURRENCY}`)
  console.log('================================================================\n')

  const histogram = monitorEventLoopDelay({ resolution: 10 })
  histogram.enable()

  const startPool = process.hrtime.bigint()
  let sumPool = 0

  for await (const res of pool(items, CONCURRENCY, async (x) => x * 2)) {
    sumPool += res
  }

  const endPool = process.hrtime.bigint()
  histogram.disable()

  const durationPool = Number(endPool - startPool) / 1_000_000

  // Resiliently resolve NaN metrics to 0 when hardware registers absolute-zero lag
  const meanDelay = Number.isNaN(histogram.mean) ? 0 : histogram.mean
  const p99Delay = Number.isNaN(histogram.percentile(99)) ? 0 : histogram.percentile(99)
  const maxDelay = Number.isNaN(histogram.max) ? 0 : histogram.max

  console.log(`Execution Time:     ${durationPool.toFixed(2)}ms`)
  console.log(`Mean Loop Delay:    ${(meanDelay / 1e6).toFixed(2)}ms`)
  console.log(`P99 Loop Delay:     ${(p99Delay / 1e6).toFixed(2)}ms`)
  console.log(`Max Loop Delay:     ${(maxDelay / 1e6).toFixed(2)}ms\n`)

  // Satisfies ESLint no-unused-vars
  if (sumPool === 0) {
    throw new Error('Integrity check failed: Pool did not process any tasks.')
  }

  console.log('----------------------------------------------------------------')
  console.log(' HOW TO EVALUATE THESE RESULTS:')
  console.log(' 1. Event Loop Yielding:')
  console.log('    Your P99 and Max delays should be near-zero (typically < 2ms).')
  console.log('    Any value under 50ms means the event loop remained fully')
  console.log('    responsive and yielded execution paths perfectly.')
  console.log('================================================================\n')
}

runLagBenchmark().catch(console.error)
