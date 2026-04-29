import {
  waitForEvenAppBridge,
  OsEventTypeList,
  EventSourceType,
} from '@evenrealities/even_hub_sdk'
import { review, isDue } from './sm2'
import { loadDeck, saveDeck, updateCard } from './store'
import { showFront, showBack, showDone } from './display'
import type { Rating } from './types'

async function main() {
  const bridge = await waitForEvenAppBridge()
  const deck = loadDeck()
  const queue = deck.cards.filter(isDue)

  let index = 0
  let showingBack = false

  if (queue.length === 0) {
    await showDone(bridge)
    return
  }

  await showFront(bridge, queue[index].front, index, queue.length)

  bridge.onEvenHubEvent(async (event) => {
    const sys = event.sysEvent
    if (!sys) return

    if (!showingBack) {
      if (sys.eventType === OsEventTypeList.CLICK_EVENT) {
        showingBack = true
        await showBack(bridge, queue[index].front, queue[index].back)
      }
      return
    }

    let rating: Rating | null = null
    if (sys.eventType === OsEventTypeList.SCROLL_TOP_EVENT) rating = 'good'
    else if (sys.eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) rating = 'again'
    else if (sys.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) rating = 'easy'
    else if (
      sys.eventType === OsEventTypeList.CLICK_EVENT &&
      sys.eventSource === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L
    ) rating = 'hard'

    if (!rating) return

    const updated = review(queue[index], rating)
    saveDeck(updateCard(deck, updated))

    index++
    showingBack = false

    if (index >= queue.length) {
      await showDone(bridge)
    } else {
      await showFront(bridge, queue[index].front, index, queue.length)
    }
  })
}

main()
