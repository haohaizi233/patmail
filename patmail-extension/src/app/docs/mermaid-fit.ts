export const MAX_INLINE_FIT_SCALE = 1
export const MAX_INTERACTIVE_FIT_SCALE = 1.25

export interface FitTransform {
  scale: number
  x: number
  y: number
}

/** Cap fit-to-width scaling so narrow vertical diagrams stay crisp and centered instead of stretching huge. */
export function computeFitWidth(hostWidth: number, diagramWidth: number, maxScale: number): FitTransform | null {
  if (
    !Number.isFinite(hostWidth) ||
    !Number.isFinite(diagramWidth) ||
    !Number.isFinite(maxScale) ||
    hostWidth <= 32 ||
    diagramWidth <= 0 ||
    maxScale <= 0
  ) {
    return null
  }
  const scale = Math.max(0.001, Math.min(maxScale, (hostWidth - 32) / diagramWidth))
  const x = Math.max(16, (hostWidth - diagramWidth * scale) / 2)
  return { scale, x, y: 16 }
}

/** Cap fit-to-window scaling for expanded viewers so small diagrams do not over-magnify. */
export function computeFitWindow(
  hostWidth: number,
  hostHeight: number,
  diagramWidth: number,
  diagramHeight: number,
  maxScale = MAX_INTERACTIVE_FIT_SCALE,
): FitTransform | null {
  if (
    !Number.isFinite(hostWidth) ||
    !Number.isFinite(hostHeight) ||
    !Number.isFinite(diagramWidth) ||
    !Number.isFinite(diagramHeight) ||
    !Number.isFinite(maxScale) ||
    hostWidth <= 0 ||
    hostHeight <= 0 ||
    diagramWidth <= 0 ||
    diagramHeight <= 0 ||
    maxScale <= 0
  ) {
    return null
  }
  const scale = Math.max(
    0.001,
    Math.min(maxScale, (hostWidth - 32) / diagramWidth, (hostHeight - 32) / diagramHeight),
  )
  const x = (hostWidth - diagramWidth * scale) / 2
  const y = (hostHeight - diagramHeight * scale) / 2
  return { scale, x, y }
}
