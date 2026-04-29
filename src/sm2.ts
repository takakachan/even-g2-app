import type { Card, Rating } from './types'

const QUALITY: Record<Rating, number> = { again: 1, hard: 2, good: 4, easy: 5 }

export function review(card: Card, rating: Rating): Card {
  const q = QUALITY[rating]
  let { interval, repetitions, easeFactor } = card

  if (q >= 3) {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions++
  } else {
    repetitions = 0
    interval = 1
  }

  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))

  const due = new Date()
  due.setDate(due.getDate() + interval)

  return { ...card, interval, repetitions, easeFactor, dueDate: due.toISOString() }
}

export function isDue(card: Card): boolean {
  return new Date(card.dueDate) <= new Date()
}
