import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration: number = 400): number {
  const [count, setCount] = useState(target)

  useEffect(() => {
    let startTimestamp: number | null = null
    const startValue = count

    if (startValue === target) return

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + (target - startValue) * easeOut)
      setCount(current)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }

    const frameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frameId)
  }, [target, duration])

  return count
}
