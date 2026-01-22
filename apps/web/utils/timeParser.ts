export function parseTime(timeStr: string): number | null {
  if (!timeStr || timeStr.trim() === '') return null

  const trimmed = timeStr.trim()

  try {
    const parts = trimmed.split(':')
    if (parts.length > 2) {
      return null
    }

    if (parts.length === 2) {
      const minutesStr = parts[0].trim()
      const secondsStr = parts[1].trim()

      const minutes = parseInt(minutesStr, 10)
      const seconds = parseFloat(secondsStr)

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) ||
          Number.isNaN(minutes) || Number.isNaN(seconds) ||
          minutes < 0 || seconds < 0) {
        return null
      }

      return minutes * 60 + seconds
    } else {
      const seconds = parseFloat(trimmed)

      if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
        return null
      }

      return seconds
    }
  } catch {
    return null
  }
}
