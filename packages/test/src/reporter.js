import { styleText } from 'node:util'

export function text (task, indent = '', { stdout, stderr, env } = process) {
  const pkgName = env.npm_package_name
  if (task.error) {
    env.QUECTO_TEST_EXIT_CODE = '1'
    const trace = (task.error.stack || task.error).toString().split('\n')
      .filter(line => !(pkgName && line.includes(pkgName)) && !line.includes('node:internal/'))
      .join(`\n${indent}    `)
    stderr.write(styleText('red', `${indent}✘ ${task.name} (${task.duration}ms)\n${indent}    ${trace}\n`))
  } else if (task.skipped) {
    stdout.write(styleText('gray', `${indent}- ${task.name} (skipped)\n`))
  } else {
    // Root Node is invisible. Only render its children.
    if (task.name !== 'QUECTO_ROOT_NODE') {
      const symbol = task.children.length ? '▶' : '✔'
      const color = task.children.length ? 'blue' : 'green'
      stdout.write(styleText(color, `${indent}${symbol} ${task.name} (${task.duration}ms)\n`))
      indent += '  '
    }
  }
  task.logs.forEach(log => stdout.write(styleText('gray', `${indent}| ${log.replace(/\n/g, `\n${indent}| `)}\n`)))
  task.children.forEach(child => text(child, indent, { stdout, stderr, env }))
}
