import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { Rating } from './types'

const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']
const LABELS: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

let initialized = false

function makeText(content: string, y: number, height: number, captureEvents = false): TextContainerProperty {
  return new TextContainerProperty({ xPosition: 0, yPosition: y, width: 576, height, content, isEventCapture: captureEvents ? 1 : 0 })
}

function ratingBar(selected: Rating): string {
  return RATINGS.map(r => r === selected ? `[${LABELS[r]}]` : ` ${LABELS[r]} `).join('  ')
}

async function setPage(bridge: EvenAppBridge, textObject: TextContainerProperty[]) {
  if (!initialized) {
    await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({ textObject }))
    initialized = true
  } else {
    await bridge.rebuildPageContainer(new RebuildPageContainer({ textObject }))
  }
}

export async function showDeckSelect(bridge: EvenAppBridge, names: string[], idx: number) {
  const VISIBLE = 5
  const start = Math.max(0, Math.min(idx - 2, names.length - VISIBLE))
  const visible = names.slice(start, start + VISIBLE)
  const lines = visible.map((n, i) => {
    const realIdx = start + i
    const marker = realIdx === idx ? '▶' : ' '
    return `${marker} ${n}`
  })
  await setPage(bridge, [
    makeText('デッキ選択', 4, 32),
    makeText(lines.join('\n'), 44, 196, true),
    makeText('scroll=移動  tap=開始', 244, 44),
  ])
}

export async function showFront(bridge: EvenAppBridge, front: string, index: number, total: number) {
  await setPage(bridge, [
    makeText(`${index + 1} / ${total}`, 0, 36),
    makeText(front, 44, 196, true),
    makeText('tap to reveal', 244, 44),
  ])
}

export async function showBack(bridge: EvenAppBridge, front: string, back: string, selected: Rating) {
  await setPage(bridge, [
    makeText(front, 0, 60),
    makeText(back, 68, 132, true),
    makeText(ratingBar(selected), 204, 44),
    makeText('scroll=選択  tap=確定  2x=戻る', 250, 38),
  ])
}

export async function showDone(bridge: EvenAppBridge) {
  await setPage(bridge, [makeText('今日の復習完了！', 110, 80, true)])
}
