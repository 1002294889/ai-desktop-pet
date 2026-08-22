import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
  Euler,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
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
  const RigRoot = namedBone('RigRoot', [0, 0.88, 0])
  const Body = namedBone('Body', [0, 0.48, 0])
  const Chest = namedBone('Chest', [0, 0.4, 0])
  const Neck = namedBone('Neck', [0, 0.28, 0])
  const Head = namedBone('Head', [0, 0.22, 0])
  const LeftEar = namedBone('LeftEar', [-0.28, 0.53, -0.02])
  const RightEar = namedBone('RightEar', [0.28, 0.53, -0.02])
  const LeftShoulder = namedBone('LeftShoulder', [-0.39, 0.02, 0])
  const LeftArm = namedBone('LeftArm', [-0.15, -0.02, 0])
  const LeftForeArm = namedBone('LeftForeArm', [-0.46, 0, 0])
  const LeftHand = namedBone('LeftHand', [-0.38, 0, 0])
  const RightShoulder = namedBone('RightShoulder', [0.39, 0.02, 0])
  const RightArm = namedBone('RightArm', [0.15, -0.02, 0])
  const RightForeArm = namedBone('RightForeArm', [0.46, 0, 0])
  const RightHand = namedBone('RightHand', [0.38, 0, 0])
  const LeftLeg = namedBone('LeftLeg', [-0.24, 0, 0])
  const LeftShin = namedBone('LeftShin', [0, -0.44, 0.02])
  const LeftFoot = namedBone('LeftFoot', [0, -0.41, 0.1])
  const RightLeg = namedBone('RightLeg', [0.24, 0, 0])
  const RightShin = namedBone('RightShin', [0, -0.44, 0.02])
  const RightFoot = namedBone('RightFoot', [0, -0.41, 0.1])
  const Mouth = namedBone('Mouth', [0, -0.25, 0.77])
  const LeftEye = namedBone('LeftEye', [-0.25, 0.1, 0.69])
  const RightEye = namedBone('RightEye', [0.25, 0.1, 0.69])

  LeftArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.7)
  RightArm.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -0.7)

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
      new SphereGeometry(0.68, 28, 18)
        .scale(0.94, 1.1, 0.78)
        .translate(0, 1.36, 0),
      boneIndices.get('Body')
    ),
    skinnedPart(
      new SphereGeometry(0.76, 28, 18)
        .scale(1, 0.91, 0.94)
        .translate(0, 2.26, 0),
      boneIndices.get('Head')
    ),
    skinnedLimbPart(
      capsuleBetween(leftShoulder, leftElbow, 0.145),
      leftShoulder,
      leftElbow,
      boneIndices.get('LeftArm'),
      boneIndices.get('LeftForeArm')
    ),
    skinnedLimbPart(
      capsuleBetween(leftElbow, leftWrist, 0.125),
      leftElbow,
      leftWrist,
      boneIndices.get('LeftForeArm'),
      boneIndices.get('LeftHand')
    ),
    skinnedPart(
      new SphereGeometry(0.17, 18, 12)
        .scale(1.1, 0.82, 0.78)
        .translate(...leftWrist.toArray()),
      boneIndices.get('LeftHand')
    ),
    skinnedLimbPart(
      capsuleBetween(rightShoulder, rightElbow, 0.145),
      rightShoulder,
      rightElbow,
      boneIndices.get('RightArm'),
      boneIndices.get('RightForeArm')
    ),
    skinnedLimbPart(
      capsuleBetween(rightElbow, rightWrist, 0.125),
      rightElbow,
      rightWrist,
      boneIndices.get('RightForeArm'),
      boneIndices.get('RightHand')
    ),
    skinnedPart(
      new SphereGeometry(0.17, 18, 12)
        .scale(1.1, 0.82, 0.78)
        .translate(...rightWrist.toArray()),
      boneIndices.get('RightHand')
    ),
    skinnedLimbPart(
      capsuleBetween(leftHip, leftKnee, 0.19),
      leftHip,
      leftKnee,
      boneIndices.get('LeftLeg'),
      boneIndices.get('LeftShin')
    ),
    skinnedLimbPart(
      capsuleBetween(leftKnee, leftAnkle, 0.155),
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
      capsuleBetween(rightHip, rightKnee, 0.19),
      rightHip,
      rightKnee,
      boneIndices.get('RightLeg'),
      boneIndices.get('RightShin')
    ),
    skinnedLimbPart(
      capsuleBetween(rightKnee, rightAnkle, 0.155),
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
        .scale(0.96, 1, 0.9)
        .translate(0.62, 1.2, -0.35),
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

function rabbitFoot(ankle, side) {
  return new SphereGeometry(0.2, 18, 12)
    .scale(0.9, 0.68, 1.65)
    .rotateY(side * 0.28)
    .translate(ankle.x, ankle.y + 0.13, ankle.z + 0.2)
}

function worldPosition(bone) {
  return bone.getWorldPosition(new Vector3())
}

function capsuleBetween(start, end, radius) {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const geometry = new CapsuleGeometry(
    radius,
    Math.max(0.04, length - radius * 2),
    8,
    14
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
      vectorTrack('RigRoot.position', [0, 1.2, 2.4], [[0, 0.88, 0], [0, 0.895, 0], [0, 0.88, 0]]),
      vectorTrack('Body.scale', [0, 1.2, 2.4], [[1, 1, 1], [1.012, 0.99, 1.01], [1, 1, 1]]),
      quaternionTrack('Chest.quaternion', [0, 1.2, 2.4], 'z', [0, -0.018, 0]),
      quaternionTrack('Head.quaternion', [0, 1.2, 2.4], 'z', [-0.018, 0.032, -0.018]),
      quaternionTrack('LeftArm.quaternion', [0, 1.2, 2.4], 'z', [0, -0.035, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 1.2, 2.4], 'z', [0, 0.035, 0], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 1.2, 2.4], 'z', [0, -0.022, 0]),
      quaternionTrack('RightForeArm.quaternion', [0, 1.2, 2.4], 'z', [0, 0.022, 0]),
      quaternionTrack('LeftEar.quaternion', [0, 1.2, 2.4], 'z', [0.015, -0.018, 0.015]),
      quaternionTrack('RightEar.quaternion', [0, 1.2, 2.4], 'z', [-0.015, 0.018, -0.015])
    ]),
    clip('Walk', 1, [
      vectorTrack('RigRoot.position', [0, 0.25, 0.5, 0.75, 1], [[0, 0.88, 0], [0.115, 0.92, 0], [0.23, 0.88, 0], [0.345, 0.92, 0], [0.46, 0.88, 0]]),
      vectorTrack('Body.position', [0, 0.25, 0.5, 0.75, 1], [[0, 0.48, 0], [0, 0.5, 0], [0, 0.48, 0], [0, 0.5, 0], [0, 0.48, 0]]),
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
      quaternionTrack('LeftArm.quaternion', [0, 2], 'z', [-0.18, -0.18], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 2], 'z', [0.18, 0.18], bones.RightArm.quaternion),
      quaternionTrack('Head.quaternion', [0, 1, 2], 'z', [-0.025, 0.028, -0.025]),
      quaternionTrack('LeftEar.quaternion', [0, 1, 2], 'z', [0.04, 0.015, 0.04]),
      quaternionTrack('RightEar.quaternion', [0, 1, 2], 'z', [-0.04, -0.015, -0.04])
    ]),
    clip('Sleep', 2.8, [
      eulerTrack('RigRoot.quaternion', [0, 1.4, 2.8], [[0.04, 0, 1.49], [0.035, 0, 1.49], [0.04, 0, 1.49]]),
      vectorTrack('RigRoot.position', [0, 1.4, 2.8], [[0, 0.76, 0], [0, 0.775, 0], [0, 0.76, 0]]),
      vectorTrack('Body.scale', [0, 1.4, 2.8], [[1.03, 0.97, 1.01], [1.055, 0.955, 1.025], [1.03, 0.97, 1.01]]),
      quaternionTrack('Head.quaternion', [0, 1.4, 2.8], 'z', [-0.14, -0.12, -0.14]),
      eulerTrack('LeftShoulder.quaternion', [0, 2.8], [[0, 1.02, 0], [0, 1.02, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 2.8], [[0, -1.02, 0], [0, -1.02, 0]]),
      eulerTrack('LeftArm.quaternion', [0, 2.8], [[0.18, 0, -0.18], [0.18, 0, -0.18]], bones.LeftArm.quaternion),
      eulerTrack('RightArm.quaternion', [0, 2.8], [[-0.18, 0, 0.18], [-0.18, 0, 0.18]], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 2.8], 'z', [-0.82, -0.82]),
      quaternionTrack('RightForeArm.quaternion', [0, 2.8], 'z', [0.82, 0.82]),
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
      vectorTrack('RigRoot.position', [0, 0.58, 1.25], [[0, 0.76, 0], [0, 0.68, 0], [0, 0.88, 0]]),
      quaternionTrack('Head.quaternion', [0, 0.58, 1.25], 'z', [-0.14, -0.05, 0]),
      eulerTrack('LeftShoulder.quaternion', [0, 0.58, 1.25], [[0, 1.02, 0], [0, 0.35, 0], [0, 0, 0]]),
      eulerTrack('RightShoulder.quaternion', [0, 0.58, 1.25], [[0, -1.02, 0], [0, -0.35, 0], [0, 0, 0]]),
      eulerTrack('LeftArm.quaternion', [0, 0.58, 1.25], [[0.18, 0, -0.18], [0.08, 0, -0.08], [0, 0, 0]], bones.LeftArm.quaternion),
      eulerTrack('RightArm.quaternion', [0, 0.58, 1.25], [[-0.18, 0, 0.18], [-0.08, 0, 0.08], [0, 0, 0]], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 0.58, 1.25], 'z', [-0.82, -0.28, 0]),
      quaternionTrack('RightForeArm.quaternion', [0, 0.58, 1.25], 'z', [0.82, 0.28, 0]),
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
      vectorTrack('RigRoot.position', [0, 0.3, 0.6, 0.9, 1.2], [[0, 0.88, 0], [0, 1.18, 0], [0, 0.88, 0], [0, 1.18, 0], [0, 0.88, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, -1.65, -1.5, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, 1.65, 1.5, 0], bones.RightArm.quaternion)
    ]),
    clip('Angry', 1, [
      quaternionTrack('Body.quaternion', [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1], 'z', [0, -0.08, 0.08, -0.08, 0.08, -0.05, 0]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, 0.7, 0.7, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, -0.7, -0.7, 0], bones.RightArm.quaternion)
    ]),
    clip('Jump', 1.65, [
      vectorTrack('RigRoot.position', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[0, 0.88, 0], [0, 0.7, 0], [0, 1.28, 0], [0, 1.62, 0], [0, 1.6, 0], [0, 1.18, 0], [0, 0.7, 0], [0, 0.88, 0]]),
      vectorTrack('Body.scale', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], [[1, 1, 1], [1.08, 0.86, 1.04], [0.96, 1.08, 0.98], [0.95, 1.11, 0.97], [0.96, 1.09, 0.98], [1.02, 0.96, 1.01], [1.09, 0.84, 1.04], [1, 1, 1]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], 'z', [0, -0.42, -1.55, -2.02, -2.02, -1.35, -0.65, 0], bones.LeftArm.quaternion),
      quaternionTrack('RightArm.quaternion', [0, 0.18, 0.46, 0.78, 1.02, 1.32, 1.48, 1.65], 'z', [0, 0.42, 1.55, 2.02, 2.02, 1.35, 0.65, 0], bones.RightArm.quaternion),
      quaternionTrack('LeftForeArm.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'z', [0, -0.22, -0.38, -0.38, -0.18, 0]),
      quaternionTrack('RightForeArm.quaternion', [0, 0.18, 0.78, 1.02, 1.48, 1.65], 'z', [0, 0.22, 0.38, 0.38, 0.18, 0]),
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
      eulerTrack('RightShoulder.quaternion', [0, 0.22, 1.42, 1.7], [[0, 0, 0], [0, 0, 0.04], [0, 0, 0.04], [0, 0, 0]]),
      quaternionTrack('RightArm.quaternion', [0, 0.22, 1.42, 1.7], 'z', [0, 1.55, 1.55, 0], bones.RightArm.quaternion),
      quaternionTrack('RightForeArm.quaternion', [0, 0.22, 0.46, 0.7, 0.94, 1.18, 1.42, 1.7], 'z', [0, 0.75, 1.08, 0.66, 1.08, 0.66, 0.75, 0]),
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
