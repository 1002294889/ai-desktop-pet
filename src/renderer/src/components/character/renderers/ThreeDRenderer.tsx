import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode
} from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import {
  ACESFilmicToneMapping,
  Color,
  SRGBColorSpace
} from 'three'

import type {
  LoadedCharacter,
  LoadedThreeDCharacterAction
} from '../../../../../shared/character'
import type { EmotionSnapshot } from '../../../../../shared/companion-state'
import type { PetAction } from '../../../../../shared/pet-action'
import { ProceduralDemoCharacter } from './three-d/ProceduralDemoCharacter'
import { ThreeDModelCharacter } from './three-d/ThreeDModelCharacter'
import type { ThreeDModelDiagnostics } from './three-d/ThreeDModelCharacter'
import {
  DEFAULT_3D_ACTION_DURATIONS_MS,
  isDefaultLoopingThreeDAction
} from './three-d/three-d-animation'

interface ThreeDRendererProps {
  action: LoadedThreeDCharacterAction
  character: LoadedCharacter
  emotion?: EmotionSnapshot
  onComplete: () => void
  renderedActionName: string
  requestedActionName: PetAction
  restartKey: number
}

interface ThreeDRendererErrorBoundaryState {
  failed: boolean
}

const TARGET_FRAME_INTERVAL_MS = 1_000 / 30

export function ThreeDRenderer({
  action,
  character,
  emotion,
  onComplete,
  renderedActionName,
  requestedActionName,
  restartKey
}: ThreeDRendererProps): React.JSX.Element {
  const [modelLoadState, setModelLoadState] = useState<
    'loading' | 'ready' | 'error'
  >('ready')
  const [modelDiagnostics, setModelDiagnostics] = useState<ThreeDModelDiagnostics>()
  const onCompleteRef = useRef(onComplete)
  const { manifest } = character
  const configuration = manifest['3d']
  const width = manifest.defaultWidth
  const height = manifest.defaultHeight
  const durationMs =
    action.definition.durationMs ??
    DEFAULT_3D_ACTION_DURATIONS_MS[requestedActionName] ??
    1_000
  const handleModelLoadStateChange = useCallback(
    (state: 'loading' | 'ready' | 'error') => setModelLoadState(state),
    []
  )
  const handleModelDiagnosticsChange = useCallback(
    (diagnostics: ThreeDModelDiagnostics | undefined) =>
      setModelDiagnostics(diagnostics),
    []
  )
  const viewportStyle = useMemo(
    () => ({ width: `${width}px`, height: `${height}px` }),
    [height, width]
  )

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const needsRendererFallbackTimer =
      configuration?.source === 'procedural' ||
      (configuration?.source === 'model' && modelLoadState === 'error')

    const actionLoops =
      renderedActionName === requestedActionName
        ? (action.definition.loop ?? false)
        : isDefaultLoopingThreeDAction(requestedActionName)

    if (!needsRendererFallbackTimer || actionLoops) {
      return
    }

    const completionTimer = window.setTimeout(() => {
      onCompleteRef.current()
    }, durationMs)

    return () => window.clearTimeout(completionTimer)
  }, [
    action,
    configuration?.source,
    durationMs,
    modelLoadState,
    renderedActionName,
    requestedActionName,
    restartKey
  ])

  if (!configuration) {
    return <p className="character-status">This 3D character is missing renderer configuration.</p>
  }

  const fallbackDescription =
    requestedActionName === renderedActionName
      ? ''
      : `, using ${renderedActionName} fallback`
  const developmentAnimationDescription =
    getDevelopmentAnimationDescription(configuration.source, modelDiagnostics)

  return (
    <ThreeDRendererErrorBoundary key={character.manifest.id}>
      <div
        className="character-3d-viewport"
        style={viewportStyle}
        data-model-state={modelLoadState}
        data-renderer="three-js"
        {...(import.meta.env.DEV
          ? {
              'data-animation-mode': modelDiagnostics?.playback?.mode ?? 'none',
              'data-animation-clip': modelDiagnostics?.playback?.clipName ?? '',
              'data-loaded-clips': modelDiagnostics?.clipNames.join('|') ?? '',
              'data-skinned-meshes': modelDiagnostics?.skinnedMeshCount ?? 0,
              'data-bones': modelDiagnostics?.boneCount ?? 0
            }
          : {})}
        aria-label={`${manifest.name}, ${requestedActionName}${fallbackDescription}, Three.js WebGL renderer${developmentAnimationDescription}`}
      >
        <Canvas
          className="character-3d-canvas"
          camera={{
            position: configuration.cameraPosition,
            fov: 36,
            near: 0.1,
            far: 100
          }}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{
            alpha: true,
            antialias: true,
            depth: true,
            powerPreference: 'low-power',
            preserveDrawingBuffer: false,
            stencil: false
          }}
          onCreated={({ camera, gl, scene }) => {
            gl.setClearColor(new Color(0x000000), 0)
            gl.outputColorSpace = SRGBColorSpace
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.04
            scene.background = null
            camera.lookAt(0, 0, 0)
            camera.updateProjectionMatrix()
          }}
          shadows={false}
        >
          <ThreeDFrameDriver />
          <ambientLight color="#ffffff" intensity={0.72} />
          <hemisphereLight
            color="#fff9ff"
            groundColor="#5c4a91"
            intensity={1.35}
          />
          <directionalLight
            color="#fff2dd"
            intensity={2.1}
            position={[3.5, 5, 4]}
          />
          <directionalLight
            color="#b9b4ff"
            intensity={0.55}
            position={[-3, 1.5, 2]}
          />

          <group
            position={configuration.modelPosition}
            rotation={configuration.modelRotation}
            scale={manifest.scale}
          >
            {configuration.source === 'procedural' ? (
              <ProceduralDemoCharacter
                action={requestedActionName}
                durationMs={durationMs}
                emotion={emotion}
                restartKey={restartKey}
              />
            ) : character.modelUrl ? (
              <ThreeDModelCharacter
                action={action}
                animationMappings={manifest.actions}
                actionName={requestedActionName}
                renderedActionName={renderedActionName}
                durationMs={durationMs}
                emotion={emotion}
                modelUrl={character.modelUrl}
                characterId={manifest.id}
                rootMotion={configuration.rootMotion}
                onComplete={() => onCompleteRef.current()}
                onDiagnosticsChange={handleModelDiagnosticsChange}
                onLoadStateChange={handleModelLoadStateChange}
                restartKey={restartKey}
              />
            ) : null}
          </group>
        </Canvas>

        {configuration.source === 'model' && modelLoadState === 'loading' ? (
          <span className="character-3d-status">Loading 3D model…</span>
        ) : null}
        {configuration.source === 'model' && modelLoadState === 'error' ? (
          <span className="character-3d-status" role="alert">
            This character’s 3D model could not be loaded.
          </span>
        ) : null}
      </div>
    </ThreeDRendererErrorBoundary>
  )
}

function getDevelopmentAnimationDescription(
  source: 'model' | 'procedural',
  diagnostics: ThreeDModelDiagnostics | undefined
): string {
  if (!import.meta.env.DEV || source !== 'model') {
    return ''
  }

  const clipName = diagnostics?.playback?.clipName

  return `, ${diagnostics?.skinnedMeshCount ?? 0} skinned meshes, ${diagnostics?.boneCount ?? 0} bones, loaded clips ${diagnostics?.clipNames.join(', ') || 'none'}, playback ${diagnostics?.playback?.mode ?? 'none'}${clipName ? ` ${clipName}` : ''}`
}

function ThreeDFrameDriver(): null {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        invalidate()
      }
    }, TARGET_FRAME_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [invalidate])

  return null
}

class ThreeDRendererErrorBoundary extends Component<
  { children: ReactNode },
  ThreeDRendererErrorBoundaryState
> {
  state: ThreeDRendererErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ThreeDRendererErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ThreeDRenderer] WebGL renderer failed.', {
        message: error.message,
        componentStack: info.componentStack
      })
    }
  }

  render(): ReactNode {
    return this.state.failed ? (
      <p className="character-status">This 3D character could not be rendered.</p>
    ) : (
      this.props.children
    )
  }
}
