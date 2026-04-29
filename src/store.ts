import type { Card, Deck } from './types'

const KEY = 'even-srs-deck'

export async function loadDeck(): Promise<Deck> {
  const res = await fetch('./deck.json')
  const remote: Deck = await res.json()

  const raw = localStorage.getItem(KEY)
  if (raw) {
    const local: Deck = JSON.parse(raw)
    // deck.jsonと同じデッキなら保存済み進捗を使う
    if (local.name === remote.name) return local
  }

  // 初回 or 別デッキ → deck.jsonをそのまま使う
  saveDeck(remote)
  return remote
}

export function saveDeck(deck: Deck): void {
  localStorage.setItem(KEY, JSON.stringify(deck))
}

export function updateCard(deck: Deck, updated: Card): Deck {
  return { ...deck, cards: deck.cards.map(c => c.id === updated.id ? updated : c) }
}
