import { pool } from '../index.js'

const ITERATIONS = Number(process.env.ITERATIONS) || 100_000
const CONCURRENCY = Number(process.env.CONCURRENCY) || 10
const items = Array.from({ length: ITERATIONS }, (_, i) => i)

async function runCongestionBenchmark () {
  console.log('================================================================')
  console.log(' @quecto/pool » Congestion Mode Audit')
  console.log(` Configuration: ${ITERATIONS.toLocaleString()} tasks @ Concurrency ${CONCURRENCY}`)
  console.log('================================================================\n')

  const heapBefore = process.memoryUsage().heapUsed
  const startPool = process.hrtime.bigint()
  let sumPool = 0

  // Quick worker (resolves instantly)
  const iterator = pool(items, CONCURRENCY, (x) => x * 2)

  // Force Congestion: Give workers 50ms to eagerly flood the queue
  await new Promise(resolve => setTimeout(resolve, 50))

  // Drain the heavily congested queue
  for await (const res of iterator) {
    sumPool += res
  }

  const endPool = process.hrtime.bigint()
  const heapAfter = process.memoryUsage().heapUsed

  const durationPool = Number(endPool - startPool) / 1_000_000
  const bytesAllocated = heapAfter - heapBefore

  console.log(`Execution (incl. 50ms stall): ${durationPool.toFixed(2)}ms`)
  console.log(`Garbage Collector Overhead:   ${(bytesAllocated / 1024 / 1024).toFixed(2)} MB total\n`)

  if (sumPool === 0) {
    throw new Error('Integrity check failed: Pool did not process any tasks.')
  }

  console.log('----------------------------------------------------------------')
  console.log(' HOW TO EVALUATE THESE RESULTS:')
  console.log(' 1. Algorithmic Scaling (O(1) proof):')
  console.log('    If the execution time (minus the 50ms stall) remains within')
  console.log('    10-15% of the standard Throughput benchmark, it proves that')
  console.log('    V8 is optimizing Array.prototype.shift() dynamically at O(1).')
  console.log(' 2. Memory Stability:')
  console.log('    The heap overhead should remain under ~3MB. This proves no')
  console.log('    wrapper queue objects (like LinkedList nodes) were allocated.')
  console.log('================================================================\n')
}

runCongestionBenchmark().catch(console.error)
