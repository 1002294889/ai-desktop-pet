import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, MathUtils } from 'three'
import {
  GLTFLoader,
  type GLTF
} from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { EmotionSnapshot } from '../../../../../../shared/companion-state'
import type {
  CharacterAction,
  LoadedThreeDCharacterAction,
  ThreeDCharacterAction,
  ThreeDRootMotionMode
} from '../../../../../../shared/character'
import type { PetAction } from '../../../../../../shared/pet-action'
import {
  createProceduralThreeDPose,
  getFacingTarget,
  isDefaultLoopingThreeDAction
} from './three-d-animation'
import {
  ThreeDAnimationController,
  type ThreeDAnimationDiagnostics,
  type ThreeDAnimationPlayback
} from './ThreeDAnimationController'
import { disposeThreeDObject } from './three-d-resource-disposal'

interface ThreeDModelCharacterProps {
  action: LoadedThreeDCharacterAction
  animationMappings: Readonly<Record<string, CharacterAction>>
  actionName: PetAction
  durationMs?: number
  emotion?: EmotionSnapshot
  modelUrl: string
  characterId: string
  onComplete: () => void
  onDiagnosticsChange: (diagnostics: ThreeDModelDiagnostics | undefined) => void
  onLoadStateChange: (state: 'loading' | 'ready' | 'error') => void
  renderedActionName: string
  restartKey: number
  rootMotion: ThreeDRootMotionMode
}

export interface ThreeDModelDiagnostics extends ThreeDAnimationDiagnostics {
  playback?: ThreeDAnimationPlayback
}

export function ThreeDModelCharacter({
  action,
  animationMappings,
  actionName,
  durationMs,
  emotion,
  modelUrl,
  characterId,
  onComplete,
  onDiagnosticsChange,
  onLoadStateChange,
  renderedActionName,
  restartKey,
  rootMotion
}: ThreeDModelCharacterProps): React.JSX.Element | null {
  const [model, setModel] = useState<GLTF>()
  const motionRootRef = useRef<Group>(null)
  const controllerRef = useRef<ThreeDAnimationController | undefined>(undefined)
  const actionTime = useRef(0)
  const facing = useRef(0)
  const isUsingClip = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const fallbackTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    let cancelled = false
    let loadedModel: GLTF | undefined

    setModel(undefined)
    onDiagnosticsChange(undefined)
    onLoadStateChange('loading')

    new GLTFLoader().load(
      modelUrl,
      (nextModel) => {
        if (cancelled) {
          disposeThreeDObject(nextModel.scene)
          return
        }

        // GLTFLoader creates a unique scene for this mount. We intentionally do
        // not place it in a shared cache, so its skeleton and GPU resources have
        // one clear owner and can be disposed safely when the character changes.
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
  }, [modelUrl, onDiagnosticsChange, onLoadStateChange])

  useEffect(() => {
    if (!model) {
      controllerRef.current = undefined
      return
    }

    const controller = new ThreeDAnimationController(
      model.scene,
      model.animations,
      rootMotion,
      animationMappings
    )
    const diagnostics = controller.getDiagnostics()

    controllerRef.current = controller
    onDiagnosticsChange(diagnostics)

    if (import.meta.env.DEV) {
      console.info(`[ThreeDAnimation] Loaded clips for "${characterId}":`, [
        ...diagnostics.clipNames
      ])
      console.info(`[ThreeDAnimation] Rig for "${characterId}":`, {
        skinnedMeshes: diagnostics.skinnedMeshCount,
        bones: diagnostics.boneCount,
        neutralizedRootMotionTracks: [...diagnostics.rootMotionTracks],
        missingMappings: [...diagnostics.missingMappings]
      })
    }

    return () => {
      controller.dispose()
      onDiagnosticsChange(undefined)

      if (controllerRef.current === controller) {
        controllerRef.current = undefined
      }
    }
  }, [animationMappings, characterId, model, onDiagnosticsChange, rootMotion])

  useEffect(() => {
    if (fallbackTimerRef.current !== undefined) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = undefined
    }

    actionTime.current = 0
    const isConfiguredAction = renderedActionName === actionName
    const definition: ThreeDCharacterAction = isConfiguredAction
      ? action.definition
      : {
          type: '3d',
          loop: isDefaultLoopingThreeDAction(actionName),
          ...(durationMs ? { durationMs } : {})
        }
    const controller = controllerRef.current

    if (!controller) {
      isUsingClip.current = false
      return
    }

    const playback = controller.play(
      actionName,
      definition,
      () => onCompleteRef.current()
    )

    isUsingClip.current = playback.mode === 'clip'
    onDiagnosticsChange({ ...controller.getDiagnostics(), playback })

    if (
      playback.mode === 'procedural' &&
      !(definition.loop ?? isDefaultLoopingThreeDAction(actionName))
    ) {
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = undefined
        onCompleteRef.current()
      }, durationMs ?? 1_000)
    }

    return () => {
      if (fallbackTimerRef.current !== undefined) {
        window.clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = undefined
      }
    }
  }, [
    action,
    actionName,
    durationMs,
    model,
    onDiagnosticsChange,
    renderedActionName,
    restartKey
  ])

  useFrame((_, delta) => {
    const root = motionRootRef.current

    if (!root || !model) {
      return
    }

    const safeDelta = Math.min(delta, 0.05)
    actionTime.current += safeDelta
    controllerRef.current?.update(safeDelta)

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
