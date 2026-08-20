import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Group, MathUtils, Mesh } from 'three'

import type { EmotionSnapshot } from '../../../../../../shared/companion-state'
import type { PetAction } from '../../../../../../shared/pet-action'
import {
  createProceduralThreeDPose,
  getFacingTarget
} from './three-d-animation'

interface ProceduralDemoCharacterProps {
  action: PetAction
  durationMs?: number
  emotion?: EmotionSnapshot
  restartKey: number
}

const PURPLE = new Color('#8b6ee8')
const DARK_PURPLE = new Color('#34216d')
const ACCENT = new Color('#f5a3ca')

export function ProceduralDemoCharacter({
  action,
  durationMs,
  emotion,
  restartKey
}: ProceduralDemoCharacterProps): React.JSX.Element {
  const rootRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const leftEyeRef = useRef<Mesh>(null)
  const rightEyeRef = useRef<Mesh>(null)
  const actionTime = useRef(0)
  const facing = useRef(0)

  useEffect(() => {
    actionTime.current = 0
  }, [action, restartKey])

  useFrame((_, delta) => {
    const root = rootRef.current

    if (!root) {
      return
    }

    actionTime.current += Math.min(delta, 0.05)
    const pose = createProceduralThreeDPose(
      action,
      actionTime.current,
      durationMs,
      emotion
    )
    const facingTarget = getFacingTarget(action) ?? 0

    facing.current = MathUtils.damp(facing.current, facingTarget, 7, delta)
    root.position.set(pose.rootX, pose.rootY, 0)
    root.rotation.set(pose.rootRotationX, facing.current, pose.rootRotationZ)
    root.scale.setScalar(pose.rootScale)

    if (headRef.current) {
      headRef.current.position.y = 0.72 + pose.headY
      headRef.current.rotation.z = pose.headRotationZ
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = pose.leftArmRotationZ
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = pose.rightArmRotationZ
    }

    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = pose.leftLegRotationX
    }

    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = pose.rightLegRotationX
    }

    if (leftEyeRef.current) {
      leftEyeRef.current.scale.y = pose.eyeScaleY
    }

    if (rightEyeRef.current) {
      rightEyeRef.current.scale.y = pose.eyeScaleY
    }
  })

  return (
    <group>
      <mesh position={[0, -1.17, -0.08]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.72, 40]} />
        <meshBasicMaterial
          color={DARK_PURPLE}
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>

      <group ref={rootRef}>
        <group ref={leftLegRef} position={[-0.33, -0.82, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
            <meshStandardMaterial color={DARK_PURPLE} roughness={0.68} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.33, -0.82, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
            <meshStandardMaterial color={DARK_PURPLE} roughness={0.68} />
          </mesh>
        </group>

        <mesh position={[0, -0.2, 0]} scale={[0.92, 1, 0.74]}>
          <capsuleGeometry args={[0.58, 0.72, 10, 24]} />
          <meshStandardMaterial
            color={PURPLE}
            roughness={0.52}
            metalness={0.04}
          />
        </mesh>

        <group ref={leftArmRef} position={[-0.67, 0.05, 0]}>
          <mesh position={[0, -0.34, 0]}>
            <capsuleGeometry args={[0.12, 0.5, 6, 12]} />
            <meshStandardMaterial color={PURPLE} roughness={0.58} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.67, 0.05, 0]}>
          <mesh position={[0, -0.34, 0]}>
            <capsuleGeometry args={[0.12, 0.5, 6, 12]} />
            <meshStandardMaterial color={PURPLE} roughness={0.58} />
          </mesh>
        </group>

        <group ref={headRef} position={[0, 0.72, 0]}>
          <mesh position={[-0.34, 0.52, -0.04]} rotation={[0, 0, -0.16]}>
            <coneGeometry args={[0.25, 0.62, 20]} />
            <meshStandardMaterial color={PURPLE} roughness={0.52} />
          </mesh>
          <mesh position={[0.34, 0.52, -0.04]} rotation={[0, 0, 0.16]}>
            <coneGeometry args={[0.25, 0.62, 20]} />
            <meshStandardMaterial color={PURPLE} roughness={0.52} />
          </mesh>
          <mesh scale={[0.88, 0.82, 0.76]}>
            <sphereGeometry args={[0.7, 32, 24]} />
            <meshStandardMaterial
              color={PURPLE}
              roughness={0.48}
              metalness={0.04}
            />
          </mesh>
          <mesh
            ref={leftEyeRef}
            position={[-0.24, 0.1, 0.54]}
            scale={[1, 1, 0.55]}
          >
            <sphereGeometry args={[0.075, 18, 14]} />
            <meshStandardMaterial color={DARK_PURPLE} roughness={0.7} />
          </mesh>
          <mesh
            ref={rightEyeRef}
            position={[0.24, 0.1, 0.54]}
            scale={[1, 1, 0.55]}
          >
            <sphereGeometry args={[0.075, 18, 14]} />
            <meshStandardMaterial color={DARK_PURPLE} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.17, 0.57]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.18, 0.026, 8, 22, Math.PI]} />
            <meshStandardMaterial color={DARK_PURPLE} roughness={0.7} />
          </mesh>
          <mesh position={[0.48, -0.06, 0.43]} scale={[1, 0.62, 0.35]}>
            <sphereGeometry args={[0.1, 16, 12]} />
            <meshStandardMaterial color={ACCENT} roughness={0.72} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
