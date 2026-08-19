export function topLevelContainerRanges(source) {
  const stack = []
  const ranges = []
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{' || character === '[') {
      stack.push({ start: index, topLevel: stack.length === 1 })
      continue
    }
    if (character !== '}' && character !== ']') continue
    const container = stack.pop()
    if (container?.topLevel && index > container.start + 1) {
      ranges.push({ from: container.start + 1, to: index })
    }
  }
  return ranges.sort((left, right) => left.from - right.from)
}
