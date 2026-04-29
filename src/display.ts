import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'

function makeText(content: string, y = 0, height = 288): TextContainerProperty {
  return new TextContainerProperty({ xPosition: 0, yPosition: y, width: 576, height, content })
}

export async function showFront(bridge: EvenAppBridge, front: string, index: number, total: number) {
  const container = new CreateStartUpPageContainer({
    textObject: [
      makeText(`${index + 1} / ${total}`, 0, 40),
      makeText(front, 60, 160),
      makeText('▶ タップで答えを見る', 240, 48),
    ],
  })
  await bridge.createStartUpPageContainer(container)
}

export async function showBack(bridge: EvenAppBridge, front: string, back: string) {
  const container = new RebuildPageContainer({
    textObject: [
      makeText(front, 0, 80),
      makeText(`▼ ${back}`, 90, 100),
      makeText('↑ Good  ↓ Again  2x Easy  ← Hard', 210, 48),
    ],
  })
  await bridge.rebuildPageContainer(container)
}

export async function showDone(bridge: EvenAppBridge) {
  const container = new CreateStartUpPageContainer({
    textObject: [makeText('今日の復習完了！', 100, 100)],
  })
  await bridge.createStartUpPageContainer(container)
}
