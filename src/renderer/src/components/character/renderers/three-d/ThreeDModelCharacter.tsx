import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MathUtils } from 'three'
import {
  GLTFLoader,
  type GLTF
} from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { EmotionSnapshot } from '../../../../../../shared/companion-state'
import type { LoadedThreeDCharacterAction } from '../../../../../../shared/character'
import type { PetAction } from '../../../../../../shared/pet-action'
import {
  createProceduralThreeDPose,
  getFacingTarget,
  ThreeDSkeletalAnimationAdapter
} from './three-d-animation'
import { disposeThreeDObject } from './three-d-resource-disposal'

interface ThreeDModelCharacterProps {
  action: LoadedThreeDCharacterAction
  actionName: PetAction
  durationMs?: number
  emotion?: EmotionSnapshot
  modelUrl: string
  onLoadStateChange: (state: 'loading' | 'ready' | 'error') => void
  restartKey: number
}

export function ThreeDModelCharacter({
  action,
  actionName,
  durationMs,
  emotion,
  modelUrl,
  onLoadStateChange,
  restartKey
}: ThreeDModelCharacterProps): React.JSX.Element | null {
  const [model, setModel] = useState<GLTF>()
  const motionRootRef = useRef<Group>(null)
  const adapterRef = useRef<ThreeDSkeletalAnimationAdapter | undefined>(undefined)
  const actionTime = useRef(0)
  const facing = useRef(0)
  const isUsingClip = useRef(false)

  useEffect(() => {
    let cancelled = false
    let loadedModel: GLTF | undefined

    setModel(undefined)
    onLoadStateChange('loading')

    new GLTFLoader().load(
      modelUrl,
      (nextModel) => {
        if (cancelled) {
          disposeThreeDObject(nextModel.scene)
          return
        }

        loadedModel = nextModel
        setModel(nextModel)
        onLoadStateChange('ready')
      },
      undefined,
      () => {
        if (!cancelled) {
          onLoadStateChange('error')
        }
      }
    )

    return () => {
      cancelled = true

      if (loadedModel) {
        disposeThreeDObject(loadedModel.scene)
      }
    }
  }, [modelUrl, onLoadStateChange])

  useEffect(() => {
    if (!model) {
      adapterRef.current = undefined
      return
    }

    const adapter = new ThreeDSkeletalAnimationAdapter(
      model.scene,
      model.animations
    )
    adapterRef.current = adapter

    return () => {
      adapter.dispose()

      if (adapterRef.current === adapter) {
        adapterRef.current = undefined
      }
    }
  }, [model])

  useEffect(() => {
    actionTime.current = 0
    isUsingClip.current =
      adapterRef.current?.playSemanticAction(
        actionName,
        action.definition.clip,
        action.definition.loop ?? false
      ) ?? false
  }, [action, actionName, model, restartKey])

  useFrame((_, delta) => {
    const root = motionRootRef.current

    if (!root || !model) {
      return
    }

    const safeDelta = Math.min(delta, 0.05)
    actionTime.current += safeDelta
    adapterRef.current?.update(safeDelta)

    const pose = createProceduralThreeDPose(
      actionName,
      actionTime.current,
      durationMs,
      emotion
    )
    const facingTarget = getFacingTarget(actionName) ?? 0

    facing.current = MathUtils.damp(facing.current, facingTarget, 7, safeDelta)
    root.rotation.y = facing.current

    if (isUsingClip.current) {
      root.position.set(0, 0, 0)
      root.rotation.x = 0
      root.rotation.z = 0
      root.scale.setScalar(1)
      return
    }

    root.position.set(pose.rootX, pose.rootY, 0)
    root.rotation.x = pose.rootRotationX
    root.rotation.z = pose.rootRotationZ
    root.scale.setScalar(pose.rootScale)
  })

  return model ? (
    <group ref={motionRootRef}>
      <primitive object={model.scene} dispose={null} />
    </group>
  ) : null
}
