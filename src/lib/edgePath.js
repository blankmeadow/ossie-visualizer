export function pointDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/** The point `length` along the way from `from` to `to`. */
export function stepAlong(from, to, length) {
  const span = pointDistance(from, to) || 1
  const ratio = Math.min(1, length / span)
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

export function pointAlongPath(points, fraction) {
  if (!points.length) return [0, 0]
  const lengths = points.slice(1).map((point, index) => pointDistance(points[index], point))
  const mark = lengths.reduce((total, value) => total + value, 0) * fraction
  let walked = 0
  for (let index = 0; index < lengths.length; index++) {
    if (walked + lengths[index] >= mark) {
      const anchor = stepAlong(points[index], points[index + 1], mark - walked)
      return [anchor.x, anchor.y]
    }
    walked += lengths[index]
  }
  const last = points[points.length - 1]
  return [last.x, last.y]
}

/** Render the section ELK returned without smoothing or removing any bends. */
export function elkOrthogonalPath(points, fraction = 0.5) {
  const path = points
    .map((point, index) => `${index ? 'L' : 'M'} ${point.x},${point.y}`)
    .join(' ')
  const [labelX, labelY] = pointAlongPath(points, fraction)
  return [path, labelX, labelY]
}
