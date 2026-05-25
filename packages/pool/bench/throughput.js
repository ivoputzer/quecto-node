import { pool } from '../index.js'

const ITERATIONS = Number(process.env.ITERATIONS) || 100_000
const CONCURRENCY = Number(process.env.CONCURRENCY) || 4
const items = Array.from({ length: ITERATIONS }, (_, i) => i)

async function runThroughputBenchmark () {
  console.log('================================================================')
  console.log(' @quecto/pool » Throughput & Allocation Audit')
  console.log(` Configuration: ${ITERATIONS.toLocaleString()} tasks @ Concurrency ${CONCURRENCY}`)
  console.log('================================================================\n')

  // Baseline 1: Sequential Raw Loop
  const startSeq = process.hrtime.bigint()
  let sumSeq = 0
  for (const item of items) {
    sumSeq += item * 2
  }
  const endSeq = process.hrtime.bigint()
  const durationSeq = Number(endSeq - startSeq) / 1_000_000
  console.log(`Raw Sequential For-Loop:   ${durationSeq.toFixed(2)}ms (${(durationSeq * 1000 / ITERATIONS).toFixed(3)} µs/task)`)

  // Baseline 2: Our Pool
  const heapBefore = process.memoryUsage().heapUsed
  const startPool = process.hrtime.bigint()
  let sumPool = 0

  for await (const res of pool(items, CONCURRENCY, async (x) => x * 2)) {
    sumPool += res
  }

  const endPool = process.hrtime.bigint()
  const heapAfter = process.memoryUsage().heapUsed

  const durationPool = Number(endPool - startPool) / 1_000_000
  const bytesAllocated = heapAfter - heapBefore

  console.log(`Quecto Pool:               ${durationPool.toFixed(2)}ms (${(durationPool * 1000 / ITERATIONS).toFixed(3)} µs/task)`)
  console.log(`Garbage Collector Overhead:  ${(bytesAllocated / 1024).toFixed(2)} KB total (~${(bytesAllocated / ITERATIONS).toFixed(2)} bytes/task)\n`)

  // Satisfies ESLint no-unused-vars while verifying correctness
  if (sumSeq !== sumPool || sumPool === 0) {
    throw new Error('Integrity check failed: Calculations are mismatching or empty!')
  }

  console.log('----------------------------------------------------------------')
  console.log(' HOW TO EVALUATE THESE RESULTS:')
  console.log(' 1. Microseconds per Task (µs/task):')
  console.log('    An async boundary crossing in V8 naturally costs 20-30 µs.')
  console.log('    Your pool results should sit comfortably close to this floor.')
  console.log(' 2. Bytes per Task:')
  console.log('    This should sit between 28-32 bytes, representing only the mandatory')
  console.log('    IteratorResult object ({ value, done }) allocated per yield.')
  console.log('================================================================\n')
}

runThroughputBenchmark().catch(console.error)
