import { styleText } from 'node:util'

/**
 * IPC Reporter: Transmits native JS objects securely to the parent q-test CLI.
 * Bypasses stdout entirely, preventing stream corruption.
 */
export const ipc = async (stream, { send } = process) => {
  for await (const event of stream) {
    if (send) send(event)
  }
}

/**
 * JSONL Reporter: Streams newline-delimited JSON to stdout.
 * Perfect for `jq`, `grep`, or custom CI/CD dashboard piping.
 */
export const jsonl = async (stream, { stdout } = process) => {
  for await (const event of stream) {
    // Note: Errors don't natively JSON.stringify, so we map them safely
    const payload = event.type === 'test:fail'
      ? { ...event, data: { ...event.data, error: event.data.error?.stack || event.data.error } }
      : event
    stdout.write(JSON.stringify(payload) + '\n')
  }
}

/**
 * Text Reporter: The classic, human-readable spec output.
 */
export const text = async (stream, { stdout, stderr, env } = process) => {
  const pkgName = env?.npm_package_name || ''

  for await (const event of stream) {
    const { type, data } = event
    const indent = '  '.repeat(data.depth || 0)

    // Flush any logs attached to this test first
    if (data.logs?.length) {
      data.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
    }

    if (type === 'test:pass') {
      const symbol = data.isSuite ? '▶' : '✔'
      const color = data.isSuite ? 'blue' : 'green'
      stdout.write(styleText(color, `${indent}${symbol} ${data.name} (${data.duration}ms)\n`))
    } else if (type === 'test:skip') {
      stdout.write(styleText('gray', `${indent}- ${data.name} (skipped)\n`))
    } else if (type === 'test:fail') {
      const trace = (data.error?.stack || data.error || '').toString().split('\n')
        .filter(line => !(pkgName && line.includes(pkgName)) && !line.includes('node:internal/'))
        .join(`\n${indent}    `)
      stderr.write(styleText('red', `${indent}✘ ${data.name} (${data.duration}ms)\n${indent}    ${trace}\n`))
    }
  }
}

// import { styleText } from 'node:util'

// export function text (task, indent = '', { stdout, stderr, env } = process) {
//   const pkgName = env.npm_package_name
//   if (task.error) {
//     env.QUECTO_TEST_EXIT_CODE = '1'
//     const trace = (task.error.stack || task.error).toString().split('\n')
//       .filter(line => !(pkgName && line.includes(pkgName)) && !line.includes('node:internal/'))
//       .join(`\n${indent}    `)
//     stderr.write(styleText('red', `${indent}✘ ${task.name} (${task.duration}ms)\n${indent}    ${trace}\n`))
//   } else if (task.skipped) {
//     stdout.write(styleText('gray', `${indent}- ${task.name} (skipped)\n`))
//   } else {
//     if (task.name !== 'QUECTO_ROOT_NODE') {
//       const symbol = task.children.length ? '▶' : '✔'
//       const color = task.children.length ? 'blue' : 'green'
//       stdout.write(styleText(color, `${indent}${symbol} ${task.name} (${task.duration}ms)\n`))
//       indent += '  '
//     }
//   }
//   task.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
//   task.children.forEach(child => text(child, indent, { stdout, stderr, env }))
// }

// export function jsonl (task, _indent, { stdout, env } = process) {
//   if (task.error) env.QUECTO_TEST_EXIT_CODE = '1'

//   // Root node is invisible framework scaffolding.
//   if (task.name !== 'QUECTO_ROOT_NODE') {
//     const payload = {
//       name: task.name,
//       duration: task.duration,
//       skipped: !!task.skipped,
//       error: task.error ? (task.error.stack || task.error.message) : undefined,
//       logs: task.logs,
//       isSuite: task.isSuite
//     }
//     stdout.write(JSON.stringify(payload) + '\n')
//   }

//   // Recursively flush children to the stream
//   task.children.forEach(child => jsonl(child, '', { stdout, env }))
// }
