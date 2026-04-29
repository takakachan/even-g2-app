export interface Card {
  id: string
  front: string
  back: string
  interval: number
  repetitions: number
  easeFactor: number
  dueDate: string
}

export interface Deck {
  name: string
  cards: Card[]
}

export type Rating = 'again' | 'hard' | 'good' | 'easy'
