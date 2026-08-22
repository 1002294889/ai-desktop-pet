import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
  Euler,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Vector2,
  Vector3,
  VectorKeyframeTrack
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

class NodeFileReader {
  result = null
  onerror = null
  onloadend = null

  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer()
      this.onloadend?.({ target: this })
    } catch (error) {
      this.onerror?.(error)
    }
  }

  async readAsDataURL(blob) {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer())
      this.result = `data:${blob.type};base64,${bytes.toString('base64')}`
      this.onloadend?.({ target: this })
    } catch (error) {
      this.onerror?.(error)
    }
  }
}

globalThis.FileReader ??= NodeFileReader

const outputDirectory = resolve('characters/three-skeletal-demo/assets')
const outputPath = resolve(outputDirectory, 'rigged-demo.glb')
const scene = new Scene()

scene.name = 'SkeletalDemoScene'

const bones = createRig()
const skeleton = new Skeleton(Object.values(bones))
const character = createSkinnedCharacter(skeleton, bones)

character.add(bones.RigRoot)
character.updateMatrixWorld(true)
character.bind(skeleton)
addFaceAndDetails(bones)
scene.add(character)
scene.add(createContactShadow())
scene.updateMatrixWorld(true)

const clips = createAnimationClips(bones)

for (const clip of clips) {
  clip.validate()
  clip.optimize()
}

const exported = await new GLTFExporter().parseAsync(scene, {
  animations: clips,
  binary: true,
  onlyVisible: false,
  trs: true
})

if (!(exported instanceof ArrayBuffer)) {
  throw new Error('GLTFExporter did not return a binary GLB')
}

await mkdir(outputDirectory, { recursive: true })
await writeFile(outputPath, new Uint8Array(exported))
const verified = await parseGlb(exported)
let skinnedMeshCount = 0
let boneCount = 0
const verifiedBoneNames = new Set()

verified.scene.traverse((object) => {
  if (object instanceof SkinnedMesh) {
    skinnedMeshCount += 1
    boneCount += object.skeleton.bones.length
    object.skeleton.bones.forEach((bone) => verifiedBoneNames.add(bone.name))
  }
})

if (skinnedMeshCount < 1 || boneCount < 1) {
  throw new Error('Generated GLB did not preserve its SkinnedMesh and skeleton')
}

if (verified.animations.length !== clips.length) {
  throw new Error('Generated GLB did not preserve every AnimationClip')
}

for (const requiredBone of [
  'RigRoot',
  'Body',
  'Chest',
  'Neck',
  'Head',
  'LeftEar',
  'RightEar',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftLeg',
  'LeftShin',
  'LeftFoot',
  'RightLeg',
  'RightShin',
  'RightFoot',
  'LeftEye',
  'RightEye'
]) {
  if (!verifiedBoneNames.has(requiredBone)) {
    throw new Error(`Generated GLB did not preserve look-at bone ${requiredBone}`)
  }
}

console.info(`Generated ${outputPath} (${exported.byteLength} bytes)`)
console.info(`Animation clips: ${clips.map(({ name }) => name).join(', ')}`)
console.info(`Verified rig: ${skinnedMeshCount} SkinnedMesh, ${boneCount} bones`)

function parseGlb(buffer) {
  return new Promise((resolveLoaded, rejectLoaded) => {
    new GLTFLoader().parse(buffer, '', resolveLoaded, rejectLoaded)
  })
}

function createRig() {
  const RigRoot = namedBone('RigRoot', [0, 0.84, 0])
  const Body = namedBone('Body', [0, 0.5, 0])
  const Chest = namedBone('Chest', [0, 0.39, 0])
  const Neck = namedBone('Neck', [0, 0.27, 0])
  const Head = namedBone('Head', [0, 0.21, 0])
  const LeftEar = namedBone('LeftEar', [-0.28, 0.53, -0.02])
  const RightEar = namedBone('RightEar', [0.28, 0.53, -0.02])
  const LeftShoulder = namedBone('LeftShoulder', [-0.37, 0.015, 0])
  const LeftArm = namedBone('LeftArm', [-0.13, -0.025, 0])
  const LeftForeArm = namedBone('LeftForeArm', [-0.42, 0, 0])
  const LeftHand = namedBone('LeftHand', [-0.34, 0, 0])
  const RightShoulder = namedBone('RightShoulder', [0.37, 0.015, 0])
  const RightArm = namedBone('RightArm', [0.13, -0.025, 0])
  const RightForeArm = namedBone('RightForeArm', [0.42, 0, 0])
  const RightHand = namedBone('RightHand', [0.34, 0, 0])
  const LeftLeg = namedBone('LeftLeg', [-0.23, 0, 0])
  const LeftShin = namedBone('LeftShin', [0, -0.42, 0.025])
  const LeftFoot = namedBone('LeftFoot', [0, -0.38, 0.1])
  const RightLeg = namedBone('RightLeg', [0.23, 0, 0])
  const RightShin = namedBone('RightShin', [0, -0.42, 0.025])
  const RightFoot = namedBone('RightFoot', [0, -0.38, 0.1])
  const Mouth = namedBone('Mouth', [0, -0.25, 0.77])
  const LeftEye = namedBone('LeftEye', [-0.25, 0.1, 0.69])
  const RightEye = namedBone('RightEye', [0.25, 0.1, 0.69])

  LeftArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.78)
  RightArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -0.78)
  LeftForeArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.32)
  RightForeArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -0.32)

  RigRoot.add(Body, LeftLeg, RightLeg)
  Body.add(Chest)
  Chest.add(Neck, LeftShoulder, RightShoulder)
  Neck.add(Head)
  LeftShoulder.add(LeftArm)
  LeftArm.add(LeftForeArm)
  LeftForeArm.add(LeftHand)
  RightShoulder.add(RightArm)
  RightArm.add(RightForeArm)
  RightForeArm.add(RightHand)
  LeftLeg.add(LeftShin)
  LeftShin.add(LeftFoot)
  RightLeg.add(RightShin)
  RightShin.add(RightFoot)
  Head.add(LeftEar, RightEar, Mouth, LeftEye, RightEye)
  RigRoot.updateMatrixWorld(true)

  return {
    RigRoot,
    Body,
    Chest,
    Neck,
    Head,
    LeftEar,
    RightEar,
    LeftShoulder,
    LeftArm,
    LeftForeArm,
    LeftHand,
    RightShoulder,
    RightArm,
    RightForeArm,
    RightHand,
    LeftLeg,
    LeftShin,
    LeftFoot,
    RightLeg,
    RightShin,
    RightFoot,
    Mouth,
    LeftEye,
    RightEye
  }
}

function namedBone(name, position) {
  const bone = new Bone()
  bone.name = name
  bone.position.fromArray(position)
  return bone
}

function createSkinnedCharacter(skeleton, bones) {
  const boneIndices = new Map(
    skeleton.bones.map((bone, index) => [bone.name, index])
  )
  const leftShoulder = worldPosition(bones.LeftArm)
  const leftElbow = worldPosition(bones.LeftForeArm)
  const leftWrist = worldPosition(bones.LeftHand)
  const rightShoulder = worldPosition(bones.RightArm)
  const rightElbow = worldPosition(bones.RightForeArm)
  const rightWrist = worldPosition(bones.RightHand)
  const leftHip = worldPosition(bones.LeftLeg)
  const leftKnee = worldPosition(bones.LeftShin)
  const leftAnkle = worldPosition(bones.LeftFoot)
  const rightHip = worldPosition(bones.RightLeg)
  const rightKnee = worldPosition(bones.RightShin)
  const rightAnkle = worldPosition(bones.RightFoot)
  const leftEarBase = worldPosition(bones.LeftEar)
  const rightEarBase = worldPosition(bones.RightEar)
  const parts = [
    skinnedPart(
      organicTorso(1.34),
      boneIndices.get('Body')
    ),
    skinnedPart(
      new SphereGeometry(0.38, 24, 14)
        .scale(1.18, 0.42, 0.72)
        .translate(0, 1.77, 0.015),
      boneIndices.get('Chest')
    ),
    skinnedPart(
      organicHead(2.21),
      boneIndices.get('Head')
    ),
    skinnedLimbPart(
      organicLimbBetween(leftShoulder, leftElbow, 0.165, 0.145, 0.115),
      leftShoulder,
      leftElbow,
      boneIndices.get('LeftArm'),
      boneIndices.get('LeftForeArm')
    ),
    skinnedLimbPart(
      organicLimbBetween(leftElbow, leftWrist, 0.13, 0.11, 0.085),
      leftElbow,
      leftWrist,
      boneIndices.get('LeftForeArm'),
      boneIndices.get('LeftHand')
    ),
    skinnedPart(
      softHand(leftWrist, leftElbow, -1),
      boneIndices.get('LeftHand')
    ),
    skinnedLimbPart(
      organicLimbBetween(rightShoulder, rightElbow, 0.165, 0.145, 0.115),
      rightShoulder,
      rightElbow,
      boneIndices.get('RightArm'),
      boneIndices.get('RightForeArm')
    ),
    skinnedLimbPart(
      organicLimbBetween(rightElbow, rightWrist, 0.13, 0.11, 0.085),
      rightElbow,
      rightWrist,
      boneIndices.get('RightForeArm'),
      boneIndices.get('RightHand')
    ),
    skinnedPart(
      softHand(rightWrist, rightElbow, 1),
      boneIndices.get('RightHand')
    ),
    skinnedLimbPart(
      organicLimbBetween(leftHip, leftKnee, 0.235, 0.215, 0.145),
      leftHip,
      leftKnee,
      boneIndices.get('LeftLeg'),
      boneIndices.get('LeftShin')
    ),
    skinnedLimbPart(
      organicLimbBetween(leftKnee, leftAnkle, 0.155, 0.16, 0.095),
      leftKnee,
      leftAnkle,
      boneIndices.get('LeftShin'),
      boneIndices.get('LeftFoot')
    ),
    skinnedPart(
      rabbitFoot(leftAnkle, -1),
      boneIndices.get('LeftFoot')
    ),
    skinnedLimbPart(
      organicLimbBetween(rightHip, rightKnee, 0.235, 0.215, 0.145),
      rightHip,
      rightKnee,
      boneIndices.get('RightLeg'),
      boneIndices.get('RightShin')
    ),
    skinnedLimbPart(
      organicLimbBetween(rightKnee, rightAnkle, 0.155, 0.16, 0.095),
      rightKnee,
      rightAnkle,
      boneIndices.get('RightShin'),
      boneIndices.get('RightFoot')
    ),
    skinnedPart(
      rabbitFoot(rightAnkle, 1),
      boneIndices.get('RightFoot')
    ),
    skinnedPart(
      new CapsuleGeometry(0.13, 0.56, 8, 16).translate(
        leftEarBase.x,
        leftEarBase.y + 0.3,
        leftEarBase.z
      ),
      boneIndices.get('LeftEar')
    ),
    skinnedPart(
      new CapsuleGeometry(0.13, 0.56, 8, 16).translate(
        rightEarBase.x,
        rightEarBase.y + 0.3,
        rightEarBase.z
      ),
      boneIndices.get('RightEar')
    ),
    skinnedPart(
      new SphereGeometry(0.23, 18, 12)
        .scale(0.96, 1.06, 0.9)
        .translate(0.59, 1.18, -0.35),
      boneIndices.get('Body')
    )
  ]
  const geometry = mergeGeometries(parts, false)

  if (!geometry) {
    throw new Error('Unable to merge the skeletal demo geometry')
  }

  geometry.computeBoundingSphere()

  const material = new MeshStandardMaterial({
    color: '#7f6ad2',
    metalness: 0,
    roughness: 0.78
  })
  const mesh = new SkinnedMesh(geometry, material)

  mesh.name = 'RiggedCompanion'
  mesh.frustumCulled = false
  return mesh
}

function skinnedPart(geometry, boneIndex) {
  if (boneIndex === undefined) {
    throw new Error('Unable to resolve a generated skeleton bone index')
  }

  const vertexCount = geometry.getAttribute('position').count
  const indices = new Uint16Array(vertexCount * 4)
  const weights = new Float32Array(vertexCount * 4)

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    indices[vertex * 4] = boneIndex
    weights[vertex * 4] = 1
  }

  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4))
  return geometry
}

function skinnedLimbPart(
  geometry,
  start,
  end,
  startBoneIndex,
  endBoneIndex
) {
  if (startBoneIndex === undefined || endBoneIndex === undefined) {
    throw new Error('Unable to resolve generated limb bone indices')
  }

  const positions = geometry.getAttribute('position')
  const vertexCount = positions.count
  const indices = new Uint16Array(vertexCount * 4)
  const weights = new Float32Array(vertexCount * 4)
  const limb = end.clone().sub(start)
  const lengthSquared = limb.lengthSq()
  const vertex = new Vector3()

  for (let index = 0; index < vertexCount; index += 1) {
    vertex.fromBufferAttribute(positions, index)
    const along =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, vertex.clone().sub(start).dot(limb) / lengthSquared))
        : 0
    const endWeight = smoothstep(0.58, 1, along)
    const offset = index * 4

    indices[offset] = startBoneIndex
    indices[offset + 1] = endBoneIndex
    weights[offset] = 1 - endWeight
    weights[offset + 1] = endWeight
  }

  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4))
  return geometry
}

function smoothstep(edge0, edge1, value) {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return normalized * normalized * (3 - 2 * normalized)
}

function worldPosition(bone) {
  return bone.getWorldPosition(new Vector3())
}

function organicTorso(centerY) {
  const geometry = new LatheGeometry(
    [
      [0, -0.77],
      [0.22, -0.72],
      [0.43, -0.58],
      [0.59, -0.34],
      [0.64, -0.02],
      [0.57, 0.3],
      [0.43, 0.58],
      [0.23, 0.73],
      [0, 0.77]
    ].map(([radius, y]) => new Vector2(radius, y)),
    28
  )

  geometry.scale(1, 1, 0.78)
  geometry.translate(0, centerY, 0)
  return geometry
}

function organicHead(centerY) {
  const geometry = new SphereGeometry(0.73, 30, 20)

  geometry.scale(1, 0.94, 0.96)
  geometry.translate(0, centerY, 0)
  return geometry
}

function organicLimbBetween(
  start,
  end,
  startRadius,
  middleRadius,
  endRadius
) {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const halfLength = length / 2
  const geometry = new LatheGeometry(
    [
      [0, -halfLength - 0.012],
      [startRadius * 0.82, -halfLength],
      [startRadius, -halfLength + length * 0.16],
      [middleRadius, -length * 0.04],
      [middleRadius * 0.96, length * 0.24],
      [endRadius, halfLength - length * 0.1],
      [endRadius * 0.72, halfLength],
      [0, halfLength + 0.012]
    ].map(([radius, y]) => new Vector2(radius, y)),
    16
  )
  const orientation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction.normalize()
  )
  const midpoint = start.clone().add(end).multiplyScalar(0.5)

  geometry.applyQuaternion(orientation)
  geometry.translate(midpoint.x, midpoint.y, midpoint.z)
  return geometry
}

function softHand(wrist, elbow, side) {
  const direction = wrist.clone().sub(elbow).normalize()
  const perpendicular = new Vector3(-direction.y, direction.x, 0).normalize()
  const orientation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction
  )
  const palmCenter = wrist.clone().addScaledVector(direction, 0.06)
  const fingertip = wrist.clone().addScaledVector(direction, 0.17)
  const palm = orientedEllipsoid(
    palmCenter,
    [0.135, 0.18, 0.108],
    orientation,
    18,
    12
  )
  const innerToe = orientedEllipsoid(
    fingertip.clone().addScaledVector(perpendicular, side * -0.034),
    [0.065, 0.072, 0.058],
    orientation,
    14,
    10
  )
  const outerToe = orientedEllipsoid(
    fingertip.clone().addScaledVector(perpendicular, side * 0.036),
    [0.062, 0.069, 0.056],
    orientation,
    14,
    10
  )
  const geometry = mergeGeometries([palm, innerToe, outerToe], false)

  if (!geometry) {
    throw new Error('Unable to merge a generated hand paw')
  }

  return geometry
}

function rabbitFoot(ankle, side) {
  const orientation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    side * 0.24
  )
  const heel = orientedEllipsoid(
    ankle.clone().add(new Vector3(0, 0.115, 0.075)),
    [0.145, 0.105, 0.18],
    orientation,
    18,
    12
  )
  const forefoot = orientedEllipsoid(
    ankle.clone().add(new Vector3(side * 0.035, 0.09, 0.3)),
    [0.205, 0.105, 0.3],
    orientation,
    20,
    12
  )
  const innerToe = orientedEllipsoid(
    ankle.clone().add(new Vector3(side * -0.045, 0.085, 0.52)),
    [0.072, 0.055, 0.11],
    orientation,
    14,
    10
  )
  const outerToe = orientedEllipsoid(
    ankle.clone().add(new Vector3(side * 0.095, 0.08, 0.505)),
    [0.078, 0.052, 0.105],
    orientation,
    14,
    10
  )
  const geometry = mergeGeometries(
    [heel, forefoot, innerToe, outerToe],
    false
  )

  if (!geometry) {
    throw new Error('Unable to merge a generated hind paw')
  }

  return geometry
}

function orientedEllipsoid(
  center,
  scale,
  orientation,
  widthSegments,
  heightSegments
) {
  const geometry = new SphereGeometry(1, widthSegments, heightSegments)

  geometry.scale(...scale)
  geometry.applyQuaternion(orientation)
  geometry.translate(center.x, center.y, center.z)
  return geometry
}

function addFaceAndDetails(bones) {
  const ink = new MeshStandardMaterial({ color: '#282043', metalness: 0, roughness: 0.7 })
  const light = new MeshStandardMaterial({ color: '#f2edff', metalness: 0, roughness: 0.86 })
  const blush = new MeshStandardMaterial({ color: '#e9a5c8', metalness: 0, roughness: 0.82 })
  const ear = new MeshStandardMaterial({ color: '#d4a6cf', metalness: 0, roughness: 0.84 })

  detail(bones.Body, new SphereGeometry(0.47, 22, 16), light, [0, -0.04, 0.54], [1, 1.3, 0.24])
  detail(bones.LeftEar, new CapsuleGeometry(0.072, 0.4, 6, 12), ear, [0, 0.3, 0.115], [1, 1, 0.42])
  detail(bones.RightEar, new CapsuleGeometry(0.072, 0.4, 6, 12), ear, [0, 0.3, 0.115], [1, 1, 0.42])
  detail(bones.LeftEye, new SphereGeometry(0.098, 16, 12), ink, [0, 0, 0])
  detail(bones.RightEye, new SphereGeometry(0.098, 16, 12), ink, [0, 0, 0])
  detail(bones.LeftEye, new SphereGeometry(0.026, 10, 8), light, [0.028, 0.035, 0.076])
  detail(bones.RightEye, new SphereGeometry(0.026, 10, 8), light, [0.028, 0.035, 0.076])
  detail(bones.Head, new SphereGeometry(0.165, 16, 12), light, [-0.12, -0.15, 0.69], [1, 0.78, 0.54])
  detail(bones.Head, new SphereGeometry(0.165, 16, 12), light, [0.12, -0.15, 0.69], [1, 0.78, 0.54])
  detail(bones.Head, new SphereGeometry(0.06, 12, 10), ink, [0, -0.095, 0.81], [1, 0.74, 0.6])
  detail(bones.Head, new SphereGeometry(0.068, 12, 10), blush, [-0.46, -0.055, 0.64], [1, 0.45, 0.33])
  detail(bones.Head, new SphereGeometry(0.068, 12, 10), blush, [0.46, -0.055, 0.64], [1, 0.45, 0.33])
  detail(bones.Mouth, new SphereGeometry(0.07, 12, 10), ink, [0, 0, 0.04], [1.25, 0.34, 0.55])
}

function detail(parent, geometry, material, position, scale = [1, 1, 1]) {
  const mesh = new Mesh(geometry, material)
  mesh.position.fromArray(position)
  mesh.scale.fromArray(scale)
  parent.add(mesh)
  return mesh
}

function createContactShadow() {
  const shadow = new Mesh(
    new CircleGeometry(0.86, 32),
    new MeshBasicMaterial({
      color: '#5c4c87',
      depthWrite: false,
      opacity: 0.12,
      transparent: true
    })
  )

  shadow.name = 'ContactShadow'
  shadow.position.set(0, 0.025, -0.04)
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.y = 0.34
  return shadow
}

function createAnimationClips(bones) {
  return [
    clip('Idle', 2.4, [
      vectorTrack('RigRoot.position', [0, 1.2, 2.4], [[0, 0.84, 0], [0, 0.855, 0], [0, 0.84, 0]]),
      vectorTrack('Body.scale', [0, 1.2, 2.4], [[1, 1, 1], [1.012, 0.99, 1.01], [1, 1, 1]]),
      quaternionTrack('Body.quaternion', [0, 1.2, 2.4], 'z', [0.012, -0.012, 0.012]),
      quaternionTrack('Chest.quaternion', [0, 1.2, 2.4], 'z', [0, -0.018, 0]),
      quaternionTrack('Head.quaternion', [0, 1.2, 2.4], 'z', [-0.018, 0.032, -0.018]),
      quaternionTrack('LeftArm.quaternion', [0, 1.2, 2.4], 'z', [0, -0.035, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 1.2, 2.4], 'z', [0, 0.035, 0], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 1.2, 2.4], 'z', [0, -0.022, 0], bones.LeftForeArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 1.2, 2.4], 'z', [0, 0.022, 0], bones.RightForeArm.quaternion),
      quaternionTrack('LeftEar.quaternion', [0, 1.2, 2.4], 'z', [0.015, -0.018, 0.015]),
      quaternionTrack('RightEar.quaternion', [0, 1.2, 2.4], 'z', [-0.015, 0.018, -0.015]),
      eulerTrack('LeftLeg.quaternion', [0, 1.2, 2.4], [[-0.025, 0, -0.025], [-0.04, 0, -0.038], [-0.025, 0, -0.025]]),
      eulerTrack('RightLeg.quaternion', [0, 1.2, 2.4], [[-0.012, 0, 0.035], [-0.022, 0, 0.022], [-0.012, 0, 0.035]])
    ]),
    clip('Walk', 1, [
      vectorTrack('RigRoot.position', [0, 0.25, 0.5, 0.75, 1], [[0, 0.84, 0], [0.115, 0.88, 0], [0.23, 0.84, 0], [0.345, 0.88, 0], [0.46, 0.84, 0]]),
      vectorTrack('Body.position', [0, 0.25, 0.5, 0.75, 1], [[0, 0.5, 0], [0, 0.52, 0], [0, 0.5, 0], [0, 0.52, 0], [0, 0.5, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [0.42, 0, -0.42, 0, 0.42], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [-0.42, 0, 0.42, 0, -0.42], bones.RightArm.quaternion),
      quaternionTrack('LeftLeg.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [-0.48, 0, 0.48, 0, -0.48]),
      quaternionTrack('RightLeg.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [0.48, 0, -0.48, 0, 0.48]),
      quaternionTrack('LeftShin.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [0.2, 0.08, -0.14, 0.08, 0.2]),
      quaternionTrack('RightShin.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [-0.14, 0.08, 0.2, 0.08, -0.14])
    ]),
    clip('Sit', 2, [
      vectorTrack('Body.position', [0, 1, 2], [[0, 0.2, 0], [0, 0.185, 0], [0, 0.2, 0]]),
      vectorTrack('Body.scale', [0, 1, 2], [[1.02, 0.98, 1], [1.03, 0.965, 1.01], [1.02, 0.98, 1]]),
      eulerTrack('LeftLeg.quaternion', [0, 2], [[-1.02, 0, -0.26], [-1.02, 0, -0.26]]),
      eulerTrack('RightLeg.quaternion', [0, 2], [[-1.02, 0, 0.26], [-1.02, 0, 0.26]]),
      eulerTrack('LeftShin.quaternion', [0, 2], [[1.2, 0, 0.2], [1.2, 0, 0.2]]),
      eulerTrack('RightShin.quaternion', [0, 2], [[1.2, 0, -0.2], [1.2, 0, -0.2]]),
      quaternionTrack('LeftFoot.quaternion', [0, 2], 'x', [-0.24, -0.24]),
      quaternionTrack('RightFoot.quaternion', [0, 2], 'x', [-0.24, -0.24]),
      eulerTrack('LeftShoulder.quaternion', [0, 2], [[0, 0.16, 0], [0, 0.16, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 2], [[0, -0.16, 0], [0, -0.16, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 2], 'z', [0.12, 0.12], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 2], 'z', [-0.12, -0.12], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 2], 'z', [0.1, 0.1], bones.LeftForeArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 2], 'z', [-0.1, -0.1], bones.RightForeArm.quaternion),
      quaternionTrack('Head.quaternion', [0, 1, 2], 'z', [-0.025, 0.028, -0.025]),
      quaternionTrack('LeftEar.quaternion', [0, 1, 2], 'z', [0.04, 0.015, 0.04]),
      quaternionTrack('RightEar.quaternion', [0, 1, 2], 'z', [-0.04, -0.015, -0.04])
    ]),
    clip('Sleep', 2.8, [
      eulerTrack('RigRoot.quaternion', [0, 1.4, 2.8], [[0.04, 0, 1.49], [0.035, 0, 1.49], [0.04, 0, 1.49]]),
      vectorTrack('RigRoot.position', [0, 1.4, 2.8], [[0, 0.76, 0], [0, 0.775, 0], [0, 0.76, 0]]),
      vectorTrack('Body.scale', [0, 1.4, 2.8], [[1.03, 0.97, 1.01], [1.055, 0.955, 1.025], [1.03, 0.97, 1.01]]),
      quaternionTrack('Head.quaternion', [0, 1.4, 2.8], 'z', [-0.14, -0.12, -0.14]),
      eulerTrack('LeftShoulder.quaternion', [0, 2.8], [[0, 1.15, 0], [0, 1.15, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 2.8], [[0, -1.15, 0], [0, -1.15, 0]]),
      eulerTrack('LeftArm.quaternion', [0, 2.8], [[0.18, 0, -0.18], [0.18, 0, -0.18]], bones.LeftArm.quaternion),
      eulerTrack('RightArm.quaternion', [0, 2.8], [[-0.18, 0, 0.18], [-0.18, 0, 0.18]], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 2.8], 'z', [-1.14, -1.14], bones.LeftForeArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 2.8], 'z', [1.14, 1.14], bones.RightForeArm.quaternion),
      eulerTrack('LeftLeg.quaternion', [0, 2.8], [[-1.0, 0, -0.24], [-1.0, 0, -0.24]]),
      eulerTrack('RightLeg.quaternion', [0, 2.8], [[-0.92, 0, 0.22], [-0.92, 0, 0.22]]),
      eulerTrack('LeftShin.quaternion', [0, 2.8], [[1.22, 0, 0.22], [1.22, 0, 0.22]]),
      eulerTrack('RightShin.quaternion', [0, 2.8], [[1.15, 0, -0.2], [1.15, 0, -0.2]]),
      quaternionTrack('LeftFoot.quaternion', [0, 2.8], 'x', [-0.32, -0.32]),
      quaternionTrack('RightFoot.quaternion', [0, 2.8], 'x', [-0.28, -0.28]),
      quaternionTrack('LeftEar.quaternion', [0, 1.4, 2.8], 'z', [0.16, 0.19, 0.16]),
      quaternionTrack('RightEar.quaternion', [0, 1.4, 2.8], 'z', [0.08, 0.11, 0.08]),
      vectorTrack('LeftEye.scale', [0, 2.8], [[1, 0.12, 1], [1, 0.12, 1]]),
      vectorTrack('RightEye.scale', [0, 2.8], [[1, 0.12, 1], [1, 0.12, 1]])
    ]),
    clip('Wake', 1.25, [
      eulerTrack('RigRoot.quaternion', [0, 0.58, 1.25], [[0.04, 0, 1.49], [0.02, 0, 0.58], [0, 0, 0]]),
      vectorTrack('RigRoot.position', [0, 0.58, 1.25], [[0, 0.74, 0], [0, 0.65, 0], [0, 0.84, 0]]),
      quaternionTrack('Head.quaternion', [0, 0.58, 1.25], 'z', [-0.14, -0.05, 0]),
      eulerTrack('LeftShoulder.quaternion', [0, 0.58, 1.25], [[0, 1.15, 0], [0, 0.4, 0], [0, 0, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 0.58, 1.25], [[0, -1.15, 0], [0, -0.4, 0], [0, 0, 0]]),
      eulerTrack('LeftArm.quaternion', [0, 0.58, 1.25], [[0.18, 0, -0.18], [0.08, 0, -0.08], [0, 0, 0]], bones.LeftArm.quaternion),
      eulerTrack('RightArm.quaternion', [0, 0.58, 1.25], [[-0.18, 0, 0.18], [-0.08, 0, 0.08], [0, 0, 0]], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 0.58, 1.25], 'z', [-1.14, -0.42, 0], bones.LeftForeArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 0.58, 1.25], 'z', [1.14, 0.42, 0], bones.RightForeArm.quaternion),
      eulerTrack('LeftLeg.quaternion', [0, 0.58, 1.25], [[-1, 0, -0.24], [-0.35, 0, -0.08], [0, 0, 0]]),
      eulerTrack('RightLeg.quaternion', [0, 0.58, 1.25], [[-0.92, 0, 0.22], [-0.32, 0, 0.07], [0, 0, 0]]),
      eulerTrack('LeftShin.quaternion', [0, 0.58, 1.25], [[1.22, 0, 0.22], [0.45, 0, 0.08], [0, 0, 0]]),
      eulerTrack('RightShin.quaternion', [0, 0.58, 1.25], [[1.15, 0, -0.2], [0.42, 0, -0.07], [0, 0, 0]]),
      vectorTrack('LeftEye.scale', [0, 0.42, 1.25], [[1, 0.12, 1], [1, 0.12, 1], [1, 1, 1]]),
      vectorTrack('RightEye.scale', [0, 0.42, 1.25], [[1, 0.12, 1], [1, 0.12, 1], [1, 1, 1]]),
      quaternionTrack('LeftEar.quaternion', [0, 0.58, 1.25], 'z', [0.16, -0.08, 0]),
      quaternionTrack('RightEar.quaternion', [0, 0.58, 1.25], 'z', [0.08, 0.06, 0])
    ]),
    clip('Happy', 1.2, [
      vectorTrack('RigRoot.position', [0, 0.3, 0.6, 0.9, 1.2], [[0, 0.84, 0], [0, 1.14, 0], [0, 0.84, 0], [0, 1.14, 0], [0, 0.84, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, -1.65, -1.5, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, 1.65, 1.5, 0], bones.RightArm.quaternion)
    ]),
    clip('Angry', 1, [
      quaternionTrack('Body.quaternion', [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1], 'z', [0, -0.08, 0.08, -0.08, 0.08, -0.05, 0]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, 0.7, 0.7, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, -0.7, -0.7, 0], bones.RightArm.quaternion)
    ]),
    clip('Jump', 1.65, [
      vectorTrack('RigRoot.position', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0.84, 0], [0, 0.66, 0], [0, 1.24, 0], [0, 1.58, 0], [0, 1.56, 0], [0, 1.14, 0], [0, 0.66, 0], [0, 0.84, 0]]),
      vectorTrack('Body.scale', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[1, 1, 1], [1.08, 0.86, 1.04], [0.96, 1.08, 0.98], [0.95, 1.11, 0.97], [0.96, 1.09, 0.98], [1.02, 0.96, 1.01], [1.09, 0.84, 1.04], [1, 1, 1]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], 'z', [0, -0.42, -1.55, -2.02, -2.02, -1.35, -0.65, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], 'z', [0, 0.42, 1.55, 2.02, 2.02, 1.35, 0.65, 0], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'z', [0, -0.22, -0.38, -0.38, -0.18, 0], bones.LeftForeArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'z', [0, 0.22, 0.38, 0.38, 0.18, 0], bones.RightForeArm.quaternion),
      eulerTrack('LeftLeg.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0, 0], [-0.7, 0, -0.22], [0.08, 0, -0.08], [-0.42, 0, -0.32], [-0.42, 0, -0.32], [-0.18, 0, -0.18], [-0.72, 0, -0.24], [0, 0, 0]]),
      eulerTrack('RightLeg.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0, 0], [-0.7, 0, 0.22], [0.08, 0, 0.08], [-0.42, 0, 0.32], [-0.42, 0, 0.32], [-0.18, 0, 0.18], [-0.72, 0, 0.24], [0, 0, 0]]),
      eulerTrack('LeftShin.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0, 0], [1.15, 0, 0.2], [-0.08, 0, 0.06], [0.78, 0, 0.28], [0.78, 0, 0.28], [0.35, 0, 0.16], [1.18, 0, 0.22], [0, 0, 0]]),
      eulerTrack('RightShin.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0, 0], [1.15, 0, -0.2], [-0.08, 0, -0.06], [0.78, 0, -0.28], [0.78, 0, -0.28], [0.35, 0, -0.16], [1.18, 0, -0.22], [0, 0, 0]]),
      quaternionTrack('LeftFoot.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'x', [0, -0.3, -0.18, -0.18, -0.32, 0]),
      quaternionTrack('RightFoot.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'x', [0, -0.3, -0.18, -0.18, -0.32, 0]),
      quaternionTrack('LeftEar.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.48, 1.65], 'z', [0, 0.08, -0.06, -0.12, -0.12, 0.1, 0]),
      quaternionTrack('RightEar.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.48, 1.65], 'z', [0, -0.08, 0.06, 0.12, 0.12, -0.1, 0])
    ]),
    clip('Wave', 1.7, [
      vectorTrack('Body.position', [0, 0.3, 1.35, 1.7], [[0, 0.5, 0], [-0.025, 0.5, 0], [-0.025, 0.5, 0], [0, 0.5, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 0.22, 1.42, 1.7], [[0, 0, 0], [0, 0, 0.04], [0, 0, 0.04], [0, 0, 0]]),
      quaternionTrack('RightArm.quaternion', [0, 0.22, 1.42, 1.7], 'z', [0, 1.55, 1.55, 0], bones.RightArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 0.22, 0.46, 0.7, 0.94, 1.18, 1.42, 1.7], 'z', [0, 0.95, 1.28, 0.86, 1.28, 0.86, 0.95, 0], bones.RightForeArm.quaternion),
      eulerTrack('RightHand.quaternion', [0, 0.22, 0.46, 0.7, 0.94, 1.18, 1.42, 1.7], [[0, 0, 0], [0, 0.12, 0], [0, -0.18, -0.22], [0, 0.18, 0.24], [0, -0.18, -0.22], [0, 0.18, 0.24], [0, 0.08, 0], [0, 0, 0]]),
      quaternionTrack('Head.quaternion', [0, 0.3, 1.35, 1.7], 'z', [0, -0.09, -0.07, 0]),
      quaternionTrack('Chest.quaternion', [0, 0.3, 1.35, 1.7], 'z', [0, -0.035, -0.035, 0]),
      quaternionTrack('LeftEar.quaternion', [0, 0.35, 1.35, 1.7], 'z', [0, 0.05, 0.03, 0]),
      quaternionTrack('RightEar.quaternion', [0, 0.35, 1.35, 1.7], 'z', [0, -0.04, -0.025, 0])
    ]),
    clip('Talk', 1.1, [
      vectorTrack('Mouth.scale', [0, 0.18, 0.36, 0.55, 0.75, 0.94, 1.1], [[1, 1, 1], [1, 2.5, 1], [1, 0.7, 1], [1, 2.1, 1], [1, 0.75, 1], [1, 1.8, 1], [1, 1, 1]]),
      quaternionTrack('Head.quaternion', [0, 0.3, 0.65, 1.1], 'x', [0, -0.06, 0.04, 0])
    ])
  ]
}

function clip(name, duration, tracks) {
  return new AnimationClip(name, duration, tracks)
}

function vectorTrack(name, times, vectors) {
  return new VectorKeyframeTrack(name, times, vectors.flat())
}

function quaternionTrack(name, times, axis, angles, restQuaternion = new Quaternion()) {
  const direction =
    axis === 'x'
      ? new Vector3(1, 0, 0)
      : axis === 'y'
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1)
  const values = angles.flatMap((angle) =>
    restQuaternion
      .clone()
      .multiply(new Quaternion().setFromAxisAngle(direction, angle))
      .toArray()
  )

  return new QuaternionKeyframeTrack(name, times, values)
}

function eulerTrack(name, times, rotations, restQuaternion = new Quaternion()) {
  const values = rotations.flatMap(([x, y, z]) =>
    restQuaternion
      .clone()
      .multiply(new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')))
      .toArray()
  )

  return new QuaternionKeyframeTrack(name, times, values)
}
