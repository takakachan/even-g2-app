import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { Card, Deck } from './types'

const DECKS_KEY = 'even-srs-decks'
const ACTIVE_KEY = 'even-srs-active'
const LEGACY_KEY = 'even-srs-deck'

// ── bridge storage ────────────────────────────────────────

let _bridge: EvenAppBridge | null = null

export function setBridge(b: EvenAppBridge) {
  _bridge = b
}

/** 起動時: SDKストレージ → localStorage に同期 */
export async function syncFromBridge(): Promise<void> {
  if (!_bridge) return
  try {
    const decks = await _bridge.getLocalStorage(DECKS_KEY)
    if (decks) localStorage.setItem(DECKS_KEY, typeof decks === 'string' ? decks : JSON.stringify(decks))
    const active = await _bridge.getLocalStorage(ACTIVE_KEY)
    if (active) localStorage.setItem(ACTIVE_KEY, typeof active === 'string' ? active : String(active))
  } catch { /* first run — no data yet */ }
}

/** 保存時: localStorage → SDKストレージ に書き出し（fire-and-forget） */
function syncToBridge() {
  if (!_bridge) return
  const decks = localStorage.getItem(DECKS_KEY)
  const active = localStorage.getItem(ACTIVE_KEY)
  if (decks) _bridge.setLocalStorage(DECKS_KEY, decks).catch(() => {})
  if (active) _bridge.setLocalStorage(ACTIVE_KEY, active).catch(() => {})
}

// ── migration ─────────────────────────────────────────────

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

// ── core ──────────────────────────────────────────────────

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
  syncToBridge()
}

export function deleteDeck(id: string): void {
  const decks = getRawDecks()
  delete decks[id]
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks))
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    const remaining = Object.keys(decks)
    localStorage.setItem(ACTIVE_KEY, remaining[0] ?? '')
  }
  syncToBridge()
}

export function getActiveDeckId(): string | null {
  return localStorage.getItem(ACTIVE_KEY) || null
}

export function setActiveDeckId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
  syncToBridge()
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
