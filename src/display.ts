import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { Rating } from './types'

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']
const LABELS: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

function makeText(content: string, y: number, height: number, captureEvents = false): TextContainerProperty {
  return new TextContainerProperty({ xPosition: 0, yPosition: y, width: 576, height, content, isEventCapture: captureEvents ? 1 : 0 })
}

function ratingBar(selected: Rating): string {
  return RATINGS.map(r => r === selected ? `[${LABELS[r]}]` : ` ${LABELS[r]} `).join('  ')
}

export async function showFront(bridge: EvenAppBridge, front: string, index: number, total: number) {
  const container = new CreateStartUpPageContainer({
    textObject: [
      makeText(`${index + 1} / ${total}`, 0, 36),
      makeText(front, 44, 196, true),  // isEventCapture はここだけ
      makeText('tap to reveal', 240, 48),
    ],
  })
  await bridge.createStartUpPageContainer(container)
}

export async function showBack(bridge: EvenAppBridge, front: string, back: string, selected: Rating) {
  const container = new RebuildPageContainer({
    textObject: [
      makeText(front, 0, 60),
      makeText(back, 68, 132, true),   // isEventCapture はここだけ
      makeText(ratingBar(selected), 200, 48),
      makeText('scroll=select  tap=confirm  2x=cancel', 250, 38),
    ],
  })
  await bridge.rebuildPageContainer(container)
}

export async function showDone(bridge: EvenAppBridge) {
  const container = new CreateStartUpPageContainer({
    textObject: [makeText('今日の復習完了！', 110, 80, true)],
  })
  await bridge.createStartUpPageContainer(container)
}
