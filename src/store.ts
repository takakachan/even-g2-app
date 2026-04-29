import type { Card, Deck } from './types'

const KEY = 'even-srs-deck'

const SAMPLE: Deck = {
  name: 'サンプルデッキ',
  cards: [
    { id: '1', front: 'Bonjour', back: 'こんにちは', interval: 1, repetitions: 0, easeFactor: 2.5, dueDate: new Date().toISOString() },
    { id: '2', front: 'Merci', back: 'ありがとう', interval: 1, repetitions: 0, easeFactor: 2.5, dueDate: new Date().toISOString() },
    { id: '3', front: 'Au revoir', back: 'さようなら', interval: 1, repetitions: 0, easeFactor: 2.5, dueDate: new Date().toISOString() },
  ],
}

export function loadDeck(): Deck {
  const raw = localStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : SAMPLE
}

export function saveDeck(deck: Deck): void {
  localStorage.setItem(KEY, JSON.stringify(deck))
}

export function updateCard(deck: Deck, updated: Card): Deck {
  return { ...deck, cards: deck.cards.map(c => c.id === updated.id ? updated : c) }
}
