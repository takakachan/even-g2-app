import type { Card, Deck } from './types'

const DECKS_KEY = 'even-srs-decks'
const ACTIVE_KEY = 'even-srs-active'
const LEGACY_KEY = 'even-srs-deck'

function migrateIfNeeded() {
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (!legacy) return
  const deck: Deck = JSON.parse(legacy)
  const decks = getRawDecks()
  if (!decks[deck.name]) {
    decks[deck.name] = deck
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks))
    if (!localStorage.getItem(ACTIVE_KEY)) {
      localStorage.setItem(ACTIVE_KEY, deck.name)
    }
  }
  localStorage.removeItem(LEGACY_KEY)
}

function getRawDecks(): Record<string, Deck> {
  const raw = localStorage.getItem(DECKS_KEY)
  return raw ? JSON.parse(raw) : {}
}

export function getAllDecks(): Record<string, Deck> {
  migrateIfNeeded()
  return getRawDecks()
}

export function saveDeck(id: string, deck: Deck): void {
  const decks = getRawDecks()
  decks[id] = deck
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks))
}

export function deleteDeck(id: string): void {
  const decks = getRawDecks()
  delete decks[id]
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks))
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    const remaining = Object.keys(decks)
    localStorage.setItem(ACTIVE_KEY, remaining[0] ?? '')
  }
}

export function getActiveDeckId(): string | null {
  return localStorage.getItem(ACTIVE_KEY) || null
}

export function setActiveDeckId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

export async function loadDefaultDeck(): Promise<Deck> {
  const res = await fetch('./deck.json')
  return res.json()
}

export function updateCard(deck: Deck, updated: Card): Deck {
  return { ...deck, cards: deck.cards.map(c => c.id === updated.id ? updated : c) }
}

export function addCard(deck: Deck, card: Card): Deck {
  return { ...deck, cards: [...deck.cards, card] }
}

export function deleteCard(deck: Deck, id: string): Deck {
  return { ...deck, cards: deck.cards.filter(c => c.id !== id) }
}
