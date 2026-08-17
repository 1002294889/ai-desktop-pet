import { useEffect, useRef, useState } from 'react'

import type {
  LoadedCharacter,
  LoadedSpriteCharacterAction
} from '../../../../../shared/character'
import type { PetAction } from '../../../../../shared/pet-action'

interface SpriteRendererProps {
  character: LoadedCharacter
  action: LoadedSpriteCharacterAction
  requestedActionName: PetAction
  renderedActionName: string
  playing?: boolean
  restartKey: number
  onComplete: () => void
}

export function SpriteRenderer({
  character,
  action,
  requestedActionName,
  renderedActionName,
  playing = true,
  restartKey,
  onComplete
}: SpriteRendererProps): React.JSX.Element {
  const [frameIndex, setFrameIndex] = useState(0)
  const onCompleteRef = useRef(onComplete)
  const { manifest } = character
  const { fps, loop } = action.definition
  const width = manifest.defaultWidth * manifest.scale
  const height = manifest.defaultHeight * manifest.scale

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    setFrameIndex(0)

    if (!playing) {
      return
    }

    let animationFrameId = 0
    let currentFrameIndex = 0
    let lastFrameTime = performance.now()
    let isComplete = false
    const frameDuration = 1_000 / fps

    const animate = (now: number): void => {
      if (isComplete) {
        return
      }

      const elapsed = now - lastFrameTime

      if (elapsed >= frameDuration) {
        const elapsedFrames = Math.max(1, Math.floor(elapsed / frameDuration))
        const nextFrameIndex = currentFrameIndex + elapsedFrames
        lastFrameTime += elapsedFrames * frameDuration

        if (nextFrameIndex >= action.frameUrls.length) {
          if (loop) {
            currentFrameIndex = nextFrameIndex % action.frameUrls.length
            setFrameIndex(currentFrameIndex)
          } else {
            currentFrameIndex = action.frameUrls.length - 1
            setFrameIndex(currentFrameIndex)
            isComplete = true
            onCompleteRef.current()
            return
          }
        } else {
          currentFrameIndex = nextFrameIndex
          setFrameIndex(currentFrameIndex)
        }
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    return () => {
      isComplete = true
      cancelAnimationFrame(animationFrameId)
    }
  }, [action, fps, loop, playing, restartKey])

  const frameUrl = action.frameUrls[frameIndex] ?? action.frameUrls[0]
  const fallbackDescription =
    requestedActionName === renderedActionName
      ? ''
      : `, using ${renderedActionName} fallback`

  return (
    <img
      className="character-asset"
      src={frameUrl}
      width={width}
      height={height}
      draggable={false}
      alt={`${manifest.name}, ${requestedActionName}${fallbackDescription}, frame ${frameIndex + 1} of ${action.frameUrls.length}`}
    />
  )
}
