export async function test (label, fn, concurrency = 1) {
  if (fn?.constructor?.name.includes('GeneratorFunction')) {
    console.log(`▶ ${label}`)
    const iter = fn()
    return Promise.all(Array.from({ length: concurrency }, async () => {
      for (let step = await iter.next(); !step.done; step = await iter.next()) {
        const [subLabel, subFn] = step.value
        await test(`  ${subLabel}`, subFn, concurrency)
      }
    }))
  }
  try {
    await fn()
    console.log(`✔ ${label}`)
  } catch (e) {
    process.exitCode = 1
    console.error(`✘ ${label}\n  ${(e.stack || e).toString().replace(/\n/g, '\n  ')}`)
  }
}

export const describe = test
export const it = test
test.skip = (label) => console.log(`- ${label} (skipped)`)
