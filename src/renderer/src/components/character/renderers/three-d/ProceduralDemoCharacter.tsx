import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial
} from 'three'

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

const FUR = new Color('#9179df')
const FUR_LIGHT = new Color('#b5a2ed')
const FUR_SHADOW = new Color('#6652b4')
const FACE_LIGHT = new Color('#eee8ff')
const INNER_EAR = new Color('#d8acd4')
const INK = new Color('#302554')
const BLUSH = new Color('#eba4c5')
const EYE_LIGHT = new Color('#fffafc')

export function ProceduralDemoCharacter({
  action,
  durationMs,
  emotion,
  restartKey
}: ProceduralDemoCharacterProps): React.JSX.Element {
  const rootRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const leftEarRef = useRef<Group>(null)
  const rightEarRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const leftEyeRef = useRef<Group>(null)
  const rightEyeRef = useRef<Group>(null)
  const talkMouthRef = useRef<Mesh>(null)
  const tailRef = useRef<Group>(null)
  const shadowOuterRef = useRef<Mesh>(null)
  const shadowInnerRef = useRef<Mesh>(null)
  const shadowOuterMaterialRef = useRef<MeshBasicMaterial>(null)
  const shadowInnerMaterialRef = useRef<MeshBasicMaterial>(null)
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

    const safeDelta = Math.min(delta, 0.05)
    actionTime.current += safeDelta
    const pose = createProceduralThreeDPose(
      action,
      actionTime.current,
      durationMs,
      emotion
    )
    const facingTarget = getFacingTarget(action) ?? 0

    facing.current = MathUtils.damp(facing.current, facingTarget, 7, safeDelta)
    root.position.set(pose.rootX, pose.rootY, 0)
    root.rotation.set(pose.rootRotationX, facing.current, pose.rootRotationZ)
    root.scale.set(
      pose.rootScale * pose.rootScaleX,
      pose.rootScale * pose.rootScaleY,
      pose.rootScale * pose.rootScaleZ
    )

    if (headRef.current) {
      headRef.current.position.y = 0.67 + pose.headY
      headRef.current.rotation.set(
        pose.headRotationX,
        0,
        pose.headRotationZ
      )
    }

    if (leftEarRef.current) {
      leftEarRef.current.rotation.z = -0.14 + pose.leftEarRotationZ
    }

    if (rightEarRef.current) {
      rightEarRef.current.rotation.z = 0.14 + pose.rightEarRotationZ
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.set(
        pose.leftArmRotationX,
        0,
        pose.leftArmRotationZ
      )
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(
        pose.rightArmRotationX,
        0,
        pose.rightArmRotationZ
      )
    }

    if (leftLegRef.current) {
      leftLegRef.current.position.set(-0.27, -0.64 + pose.legY, pose.legZ)
      leftLegRef.current.rotation.set(
        pose.leftLegRotationX,
        0,
        pose.leftLegRotationZ
      )
    }

    if (rightLegRef.current) {
      rightLegRef.current.position.set(0.27, -0.64 + pose.legY, pose.legZ)
      rightLegRef.current.rotation.set(
        pose.rightLegRotationX,
        0,
        pose.rightLegRotationZ
      )
    }

    leftEyeRef.current?.scale.set(1, pose.eyeScaleY, 1)
    rightEyeRef.current?.scale.set(1, pose.eyeScaleY, 1)

    if (talkMouthRef.current) {
      talkMouthRef.current.scale.set(
        0.07,
        0.04 * pose.mouthScaleY,
        0.026
      )
    }

    if (tailRef.current) {
      tailRef.current.rotation.z = -0.28 + pose.tailRotationZ
    }

    if (shadowOuterRef.current) {
      shadowOuterRef.current.scale.set(
        pose.shadowScaleX,
        pose.shadowScaleY,
        1
      )
    }

    if (shadowInnerRef.current) {
      shadowInnerRef.current.scale.set(
        pose.shadowScaleX * 0.84,
        pose.shadowScaleY * 0.78,
        1
      )
    }

    if (shadowOuterMaterialRef.current) {
      shadowOuterMaterialRef.current.opacity = pose.shadowOpacity * 0.42
    }

    if (shadowInnerMaterialRef.current) {
      shadowInnerMaterialRef.current.opacity = pose.shadowOpacity
    }
  })

  return (
    <group>
      <mesh
        ref={shadowOuterRef}
        position={[0, -1.17, -0.08]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.82, 40]} />
        <meshBasicMaterial
          ref={shadowOuterMaterialRef}
          color={INK}
          transparent
          opacity={0.05}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={shadowInnerRef}
        position={[0, -1.165, -0.07]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.62, 36]} />
        <meshBasicMaterial
          ref={shadowInnerMaterialRef}
          color={INK}
          transparent
          opacity={0.12}
          depthWrite={false}
        />
      </mesh>

      <group ref={rootRef}>
        <group
          ref={tailRef}
          position={[0.5, -0.34, -0.3]}
          rotation={[0, 0, -0.28]}
        >
          <mesh position={[0.12, 0, 0]} scale={[0.32, 0.19, 0.19]}>
            <sphereGeometry args={[1, 18, 14]} />
            <meshStandardMaterial
              color={FUR_LIGHT}
              roughness={0.78}
              metalness={0}
            />
          </mesh>
        </group>

        <group ref={leftLegRef} position={[-0.27, -0.64, 0]}>
          <mesh position={[0, -0.14, 0]}>
            <capsuleGeometry args={[0.155, 0.22, 6, 12]} />
            <meshStandardMaterial
              color={FUR_SHADOW}
              roughness={0.8}
              metalness={0}
            />
          </mesh>
          <mesh position={[0, -0.36, 0.12]} scale={[0.25, 0.16, 0.34]}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial
              color={FUR_SHADOW}
              roughness={0.82}
              metalness={0}
            />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.27, -0.64, 0]}>
          <mesh position={[0, -0.14, 0]}>
            <capsuleGeometry args={[0.155, 0.22, 6, 12]} />
            <meshStandardMaterial
              color={FUR_SHADOW}
              roughness={0.8}
              metalness={0}
            />
          </mesh>
          <mesh position={[0, -0.36, 0.12]} scale={[0.25, 0.16, 0.34]}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial
              color={FUR_SHADOW}
              roughness={0.82}
              metalness={0}
            />
          </mesh>
        </group>

        <mesh position={[0, -0.24, 0]} scale={[0.62, 0.72, 0.53]}>
          <sphereGeometry args={[1, 30, 22]} />
          <meshStandardMaterial
            color={FUR}
            roughness={0.76}
            metalness={0}
          />
        </mesh>
        <mesh position={[0, -0.28, 0.49]} scale={[0.36, 0.43, 0.065]}>
          <sphereGeometry args={[1, 24, 18]} />
          <meshStandardMaterial
            color={FACE_LIGHT}
            roughness={0.84}
            metalness={0}
          />
        </mesh>

        <group
          ref={leftArmRef}
          position={[-0.54, -0.02, -0.01]}
          rotation={[0, 0, -0.16]}
        >
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.105, 0.28, 6, 12]} />
            <meshStandardMaterial color={FUR} roughness={0.78} metalness={0} />
          </mesh>
          <mesh position={[0, -0.45, 0.015]} scale={[0.14, 0.15, 0.13]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial
              color={FUR_LIGHT}
              roughness={0.82}
              metalness={0}
            />
          </mesh>
        </group>
        <group
          ref={rightArmRef}
          position={[0.54, -0.02, -0.01]}
          rotation={[0, 0, 0.16]}
        >
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.105, 0.28, 6, 12]} />
            <meshStandardMaterial color={FUR} roughness={0.78} metalness={0} />
          </mesh>
          <mesh position={[0, -0.45, 0.015]} scale={[0.14, 0.15, 0.13]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial
              color={FUR_LIGHT}
              roughness={0.82}
              metalness={0}
            />
          </mesh>
        </group>

        <group ref={headRef} position={[0, 0.67, 0]}>
          <group
            ref={leftEarRef}
            position={[-0.32, 0.43, -0.07]}
            rotation={[0, 0, -0.14]}
          >
            <mesh position={[0, 0.17, 0]}>
              <capsuleGeometry args={[0.14, 0.34, 8, 14]} />
              <meshStandardMaterial color={FUR} roughness={0.76} metalness={0} />
            </mesh>
            <mesh position={[0, 0.17, 0.12]} scale={[0.53, 0.72, 0.28]}>
              <capsuleGeometry args={[0.14, 0.34, 8, 14]} />
              <meshStandardMaterial
                color={INNER_EAR}
                roughness={0.84}
                metalness={0}
              />
            </mesh>
          </group>
          <group
            ref={rightEarRef}
            position={[0.32, 0.43, -0.07]}
            rotation={[0, 0, 0.14]}
          >
            <mesh position={[0, 0.17, 0]}>
              <capsuleGeometry args={[0.14, 0.34, 8, 14]} />
              <meshStandardMaterial color={FUR} roughness={0.76} metalness={0} />
            </mesh>
            <mesh position={[0, 0.17, 0.12]} scale={[0.53, 0.72, 0.28]}>
              <capsuleGeometry args={[0.14, 0.34, 8, 14]} />
              <meshStandardMaterial
                color={INNER_EAR}
                roughness={0.84}
                metalness={0}
              />
            </mesh>
          </group>

          <mesh scale={[0.71, 0.63, 0.61]}>
            <sphereGeometry args={[1, 32, 24]} />
            <meshStandardMaterial
              color={FUR_LIGHT}
              roughness={0.74}
              metalness={0}
            />
          </mesh>

          <mesh position={[-0.11, -0.14, 0.55]} scale={[0.19, 0.13, 0.075]}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial
              color={FACE_LIGHT}
              roughness={0.86}
              metalness={0}
            />
          </mesh>
          <mesh position={[0.11, -0.14, 0.55]} scale={[0.19, 0.13, 0.075]}>
            <sphereGeometry args={[1, 20, 14]} />
            <meshStandardMaterial
              color={FACE_LIGHT}
              roughness={0.86}
              metalness={0}
            />
          </mesh>

          <group ref={leftEyeRef} position={[-0.22, 0.07, 0.57]}>
            <mesh scale={[0.085, 0.108, 0.045]}>
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial color={INK} roughness={0.72} metalness={0} />
            </mesh>
            <mesh
              position={[-0.022, 0.035, 0.043]}
              scale={[0.022, 0.028, 0.016]}
            >
              <sphereGeometry args={[1, 12, 10]} />
              <meshBasicMaterial color={EYE_LIGHT} />
            </mesh>
          </group>
          <group ref={rightEyeRef} position={[0.22, 0.07, 0.57]}>
            <mesh scale={[0.085, 0.108, 0.045]}>
              <sphereGeometry args={[1, 18, 14]} />
              <meshStandardMaterial color={INK} roughness={0.72} metalness={0} />
            </mesh>
            <mesh
              position={[-0.022, 0.035, 0.043]}
              scale={[0.022, 0.028, 0.016]}
            >
              <sphereGeometry args={[1, 12, 10]} />
              <meshBasicMaterial color={EYE_LIGHT} />
            </mesh>
          </group>

          <mesh position={[-0.39, -0.08, 0.5]} scale={[0.09, 0.052, 0.032]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color={BLUSH} roughness={0.84} metalness={0} />
          </mesh>
          <mesh position={[0.39, -0.08, 0.5]} scale={[0.09, 0.052, 0.032]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color={BLUSH} roughness={0.84} metalness={0} />
          </mesh>

          <mesh position={[0, -0.13, 0.63]} scale={[0.052, 0.04, 0.03]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={INK} roughness={0.76} metalness={0} />
          </mesh>
          <mesh position={[0, -0.235, 0.617]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.105, 0.018, 8, 22, Math.PI]} />
            <meshStandardMaterial color={INK} roughness={0.78} metalness={0} />
          </mesh>
          <mesh
            ref={talkMouthRef}
            position={[0, -0.225, 0.624]}
            scale={[0.07, 0.006, 0.026]}
          >
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={INK} roughness={0.8} metalness={0} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
