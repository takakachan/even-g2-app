import {
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { review, isDue } from './sm2'
import { loadDeck, saveDeck, updateCard } from './store'
import { showFront, showBack, showDone } from './display'
import type { Rating } from './types'

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

async function main() {
  const bridge = await waitForEvenAppBridge()
  const deck = loadDeck()
  const queue = deck.cards.filter(isDue)

  let index = 0
  let showingBack = false
  let selectedRating: Rating = 'good'

  if (queue.length === 0) {
    await showDone(bridge)
    return
  }

  await showFront(bridge, queue[index].front, index, queue.length)

  bridge.onEvenHubEvent(async (event) => {
const rawType = event.textEvent?.eventType ?? event.sysEvent?.eventType
    const hasEvent = event.textEvent != null || event.sysEvent != null
    const eventType = rawType ?? (hasEvent ? OsEventTypeList.CLICK_EVENT : undefined)
    if (eventType === undefined) return

    // 2回タップ → 裏面：キャンセル（表面に戻る）、表面：アプリ終了
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      if (showingBack) {
        showingBack = false
        selectedRating = 'good'
        await showFront(bridge, queue[index].front, index, queue.length)
      } else {
        await bridge.shutDownPageContainer(1)
      }
      return
    }

    if (!showingBack) {
      if (eventType === OsEventTypeList.CLICK_EVENT) {
        showingBack = true
        await showBack(bridge, queue[index].front, queue[index].back, selectedRating)
      }
      return
    }

    // 裏面: なぞる → 評価を選択
    if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
      const i = RATINGS.indexOf(selectedRating)
      selectedRating = RATINGS[Math.min(i + 1, RATINGS.length - 1)]
      await showBack(bridge, queue[index].front, queue[index].back, selectedRating)
      return
    }
    if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      const i = RATINGS.indexOf(selectedRating)
      selectedRating = RATINGS[Math.max(i - 1, 0)]
      await showBack(bridge, queue[index].front, queue[index].back, selectedRating)
      return
    }

    // タップ → 確定
    if (eventType === OsEventTypeList.CLICK_EVENT) {
      const updated = review(queue[index], selectedRating)
      saveDeck(updateCard(deck, updated))

      index++
      showingBack = false
      selectedRating = 'good'

      if (index >= queue.length) {
        await showDone(bridge)
      } else {
        await showFront(bridge, queue[index].front, index, queue.length)
      }
    }
  })
}

main()
