import {
  waitForEvenAppBridge,
  OsEventTypeList,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { review, isDue } from './sm2'

import {
  getAllDecks, saveDeck, getActiveDeckId, setActiveDeckId, updateCard,
  setBridge, syncFromBridge,
} from './store'
import { showDeckSelect, showFront, showBack, showDone, showNoDecks } from './display'
import { initManageUI } from './manage'
import type { Card, Deck, Rating } from './types'

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

type State =
  | { mode: 'no-decks' }
  | { mode: 'deck-select'; deckIds: string[]; names: string[]; idx: number }
  | { mode: 'review'; deck: Deck; deckId: string; queue: Card[]; index: number; showingBack: boolean; selectedRating: Rating; done: boolean; multiDeck: boolean }

function makeReviewState(deck: Deck, deckId: string, multiDeck: boolean): State {
  const queue = deck.cards.filter(isDue)
  return { mode: 'review', deck, deckId, queue, index: 0, showingBack: false, selectedRating: 'good', done: queue.length === 0, multiDeck }
}

async function renderState(bridge: EvenAppBridge, state: State) {
  if (state.mode === 'no-decks') {
    await showNoDecks(bridge)
  } else if (state.mode === 'deck-select') {
    const decks = getAllDecks()
    const dueCounts = state.deckIds.map(id => (decks[id]?.cards ?? []).filter(isDue).length)
    await showDeckSelect(bridge, state.names, dueCounts, state.idx)
  } else {
    if (state.done) {
      await showDone(bridge)
    } else if (state.showingBack) {
      const card = state.queue[state.index]
      await showBack(bridge, card.front, card.back, state.selectedRating)
    } else {
      await showFront(bridge, state.queue[state.index].front, state.index, state.queue.length)
    }
  }
}

async function handleEvent(bridge: EvenAppBridge, state: State, eventType: number): Promise<State> {
  if (state.mode === 'no-decks') {
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await bridge.shutDownPageContainer(1)
    }
    return state
  }

  if (state.mode === 'deck-select') {
    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      const next = { ...state, idx: Math.max(0, state.idx - 1) }
      await renderState(bridge, next)
      return next
    }
    if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      const next = { ...state, idx: Math.min(state.deckIds.length - 1, state.idx + 1) }
      await renderState(bridge, next)
      return next
    }
    if (eventType === OsEventTypeList.CLICK_EVENT) {
      const deckId = state.deckIds[state.idx]
      setActiveDeckId(deckId)
      const next = makeReviewState(getAllDecks()[deckId], deckId, true)
      await renderState(bridge, next)
      return next
    }
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      await bridge.shutDownPageContainer(1)
      return state
    }
    return state
  }

  // review mode
  if (state.done) {
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      const decks = getAllDecks()
      const deckIds = Object.keys(decks)
      const names = deckIds.map(id => decks[id].name)
      const activeDeckId = getActiveDeckId() ?? deckIds[0]
      const next: State = { mode: 'deck-select', deckIds, names, idx: deckIds.indexOf(activeDeckId) }
      await renderState(bridge, next)
      return next
    }
    return state
  }

  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (state.showingBack) {
      // 裏面: 2タップでキャンセル→表面へ
      const next = { ...state, showingBack: false, selectedRating: 'good' as Rating }
      await renderState(bridge, next)
      return next
    } else {
      if (state.multiDeck) {
        // 表面: 2タップでデッキ選択に戻る
        const decks = getAllDecks()
        const deckIds = Object.keys(decks)
        const names = deckIds.map(id => decks[id].name)
        const activeDeckId = getActiveDeckId() ?? deckIds[0]
        const next: State = { mode: 'deck-select', deckIds, names, idx: deckIds.indexOf(activeDeckId) }
        await renderState(bridge, next)
        return next
      } else {
        // デッキ1つ: 2タップで終了（SDKのデフォルトUI）
        await bridge.shutDownPageContainer(1)
        return state
      }
    }
  }

  if (!state.showingBack) {
    if (eventType === OsEventTypeList.CLICK_EVENT) {
      const next = { ...state, showingBack: true }
      await renderState(bridge, next)
      return next
    }
    return state
  }

  // 裏面: 下なぞり=評価アップ、上なぞり=評価ダウン
  if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    const i = RATINGS.indexOf(state.selectedRating)
    const next = { ...state, selectedRating: RATINGS[Math.min(i + 1, RATINGS.length - 1)] }
    await renderState(bridge, next)
    return next
  }
  if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
    const i = RATINGS.indexOf(state.selectedRating)
    const next = { ...state, selectedRating: RATINGS[Math.max(i - 1, 0)] }
    await renderState(bridge, next)
    return next
  }

  if (eventType === OsEventTypeList.CLICK_EVENT) {
    const updated = review(state.queue[state.index], state.selectedRating)
    const newDeck = updateCard(state.deck, updated)
    saveDeck(state.deckId, newDeck)

    const index = state.index + 1
    if (index >= state.queue.length) {
      const next = { ...state, deck: newDeck, done: true }
      await renderState(bridge, next)
      return next
    }
    const next = { ...state, deck: newDeck, index, showingBack: false, selectedRating: 'good' as Rating }
    await renderState(bridge, next)
    return next
  }

  return state
}

async function main() {
  const bridge = await waitForEvenAppBridge()
  setBridge(bridge)
  await syncFromBridge()
  initManageUI()

  const allDecks = getAllDecks()
  const deckIds = Object.keys(allDecks)

  let state: State

  if (deckIds.length === 0) {
    state = { mode: 'no-decks' }
  } else {
    let activeDeckId = getActiveDeckId() ?? deckIds[0]
    if (!allDecks[activeDeckId]) activeDeckId = deckIds[0]
    setActiveDeckId(activeDeckId)
    const names = deckIds.map(id => allDecks[id].name)
    if (deckIds.length === 1) {
      state = makeReviewState(allDecks[deckIds[0]], deckIds[0], false)
    } else {
      state = { mode: 'deck-select', deckIds, names, idx: deckIds.indexOf(activeDeckId) }
    }
  }

  await renderState(bridge, state)

  bridge.onEvenHubEvent(async (event) => {
    const rawType = event.textEvent?.eventType ?? event.sysEvent?.eventType
    const hasEvent = event.textEvent != null || event.sysEvent != null
    const eventType = rawType ?? (hasEvent ? OsEventTypeList.CLICK_EVENT : undefined)
    if (eventType === undefined) return
    state = await handleEvent(bridge, state, eventType)
  })
}

main()
