import { waitForEvenAppBridge, CreateStartUpPageContainer, TextContainerProperty } from '@evenrealities/even_hub_sdk'

async function init() {
  const bridge = await waitForEvenAppBridge()

  const container = new CreateStartUpPageContainer({
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        content: 'Hello from G2!',
      }),
    ],
  })

  await bridge.createStartUpPageContainer(container)
}

init()
