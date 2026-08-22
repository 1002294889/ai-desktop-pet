import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  BufferAttribute,
  CapsuleGeometry,
  CircleGeometry,
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
const character = createSkinnedCharacter(skeleton)

character.add(bones.RigRoot)
character.updateMatrixWorld(true)
character.bind(skeleton)
addFaceAndDetails(bones)
scene.add(character)
scene.add(createContactShadow())
scene.updateMatrixWorld(true)

const clips = createAnimationClips()

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

for (const requiredBone of ['Head', 'LeftEye', 'RightEye']) {
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
  const RigRoot = namedBone('RigRoot', [0, 0, 0])
  const Body = namedBone('Body', [0, 1.15, 0])
  const Head = namedBone('Head', [0, 1, 0])
  const LeftArm = namedBone('LeftArm', [-0.66, 0.4, 0])
  const RightArm = namedBone('RightArm', [0.66, 0.4, 0])
  const LeftLeg = namedBone('LeftLeg', [-0.34, -0.72, 0])
  const RightLeg = namedBone('RightLeg', [0.34, -0.72, 0])
  const Mouth = namedBone('Mouth', [0, -0.28, 0.8])
  const LeftEye = namedBone('LeftEye', [-0.28, 0.1, 0.73])
  const RightEye = namedBone('RightEye', [0.28, 0.1, 0.73])

  RigRoot.add(Body)
  Body.add(Head, LeftArm, RightArm, LeftLeg, RightLeg)
  Head.add(Mouth, LeftEye, RightEye)

  return {
    RigRoot,
    Body,
    Head,
    LeftArm,
    RightArm,
    LeftLeg,
    RightLeg,
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

function createSkinnedCharacter(skeleton) {
  const parts = [
    skinnedPart(new SphereGeometry(0.72, 24, 16).scale(1, 1.13, 0.8).translate(0, 1.15, 0), 1),
    skinnedPart(new SphereGeometry(0.84, 24, 16).scale(1.03, 0.92, 0.95).translate(0, 2.17, 0), 2),
    skinnedPart(new CapsuleGeometry(0.19, 0.62, 8, 14).translate(-0.76, 1.18, 0), 3),
    skinnedPart(new CapsuleGeometry(0.19, 0.62, 8, 14).translate(0.76, 1.18, 0), 4),
    skinnedPart(new CapsuleGeometry(0.24, 0.32, 8, 14).translate(-0.34, 0.34, 0), 5),
    skinnedPart(new CapsuleGeometry(0.24, 0.32, 8, 14).translate(0.34, 0.34, 0), 6),
    skinnedPart(new CapsuleGeometry(0.15, 0.52, 8, 14).translate(-0.35, 3.08, 0), 2),
    skinnedPart(new CapsuleGeometry(0.15, 0.52, 8, 14).translate(0.35, 3.08, 0), 2),
    skinnedPart(new SphereGeometry(0.25, 18, 12).translate(0.69, 0.95, -0.34), 1)
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

function addFaceAndDetails(bones) {
  const ink = new MeshStandardMaterial({ color: '#282043', metalness: 0, roughness: 0.7 })
  const light = new MeshStandardMaterial({ color: '#f2edff', metalness: 0, roughness: 0.86 })
  const blush = new MeshStandardMaterial({ color: '#e9a5c8', metalness: 0, roughness: 0.82 })
  const ear = new MeshStandardMaterial({ color: '#d4a6cf', metalness: 0, roughness: 0.84 })

  detail(bones.Body, new SphereGeometry(0.51, 20, 14), light, [0, -0.02, 0.58], [1, 1.28, 0.25])
  detail(bones.Head, new CapsuleGeometry(0.085, 0.38, 6, 12), ear, [-0.35, 0.93, 0.15], [1, 1, 0.45])
  detail(bones.Head, new CapsuleGeometry(0.085, 0.38, 6, 12), ear, [0.35, 0.93, 0.15], [1, 1, 0.45])
  detail(bones.LeftEye, new SphereGeometry(0.105, 16, 12), ink, [0, 0, 0])
  detail(bones.RightEye, new SphereGeometry(0.105, 16, 12), ink, [0, 0, 0])
  detail(bones.LeftEye, new SphereGeometry(0.029, 10, 8), light, [0.03, 0.04, 0.08])
  detail(bones.RightEye, new SphereGeometry(0.029, 10, 8), light, [0.03, 0.04, 0.08])
  detail(bones.Head, new SphereGeometry(0.18, 16, 12), light, [-0.13, -0.16, 0.72], [1, 0.8, 0.55])
  detail(bones.Head, new SphereGeometry(0.18, 16, 12), light, [0.13, -0.16, 0.72], [1, 0.8, 0.55])
  detail(bones.Head, new SphereGeometry(0.065, 12, 10), ink, [0, -0.1, 0.86], [1, 0.75, 0.62])
  detail(bones.Head, new SphereGeometry(0.075, 12, 10), blush, [-0.52, -0.06, 0.67], [1, 0.48, 0.35])
  detail(bones.Head, new SphereGeometry(0.075, 12, 10), blush, [0.52, -0.06, 0.67], [1, 0.48, 0.35])
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
    new CircleGeometry(0.82, 32),
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
  shadow.scale.y = 0.38
  return shadow
}

function createAnimationClips() {
  return [
    clip('Idle', 2, [
      vectorTrack('Body.scale', [0, 1, 2], [[1, 1, 1], [1.018, 0.985, 1.018], [1, 1, 1]]),
      quaternionTrack('Head.quaternion', [0, 1, 2], 'z', [0, 0.045, 0]),
      quaternionTrack('LeftArm.quaternion', [0, 1, 2], 'z', [0, -0.06, 0]),
      quaternionTrack('RightArm.quaternion', [0, 1, 2], 'z', [0, 0.06, 0])
    ]),
    clip('Walk', 1, [
      vectorTrack('RigRoot.position', [0, 0.25, 0.5, 0.75, 1], [[0, 0, 0], [0.12, 0, 0], [0.24, 0, 0], [0.36, 0, 0], [0.48, 0, 0]]),
      vectorTrack('Body.position', [0, 0.25, 0.5, 0.75, 1], [[0, 1.15, 0], [0, 1.21, 0], [0, 1.15, 0], [0, 1.21, 0], [0, 1.15, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [0.5, 0, -0.5, 0, 0.5]),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [-0.5, 0, 0.5, 0, -0.5]),
      quaternionTrack('LeftLeg.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [-0.55, 0, 0.55, 0, -0.55]),
      quaternionTrack('RightLeg.quaternion', [0, 0.25, 0.5, 0.75, 1], 'x', [0.55, 0, -0.55, 0, 0.55])
    ]),
    clip('Sit', 1.4, [
      vectorTrack('Body.position', [0, 0.7, 1.4], [[0, 0.86, 0], [0, 0.84, 0], [0, 0.86, 0]]),
      quaternionTrack('LeftLeg.quaternion', [0, 1.4], 'x', [-1.05, -1.05]),
      quaternionTrack('RightLeg.quaternion', [0, 1.4], 'x', [-1.05, -1.05]),
      quaternionTrack('Head.quaternion', [0, 0.7, 1.4], 'z', [-0.03, 0.03, -0.03])
    ]),
    clip('Sleep', 2.4, [
      quaternionTrack('RigRoot.quaternion', [0, 1.2, 2.4], 'z', [0.68, 0.68, 0.68]),
      vectorTrack('RigRoot.position', [0, 1.2, 2.4], [[0, -0.48, 0], [0, -0.46, 0], [0, -0.48, 0]]),
      vectorTrack('Body.scale', [0, 1.2, 2.4], [[1, 1, 1], [1.025, 0.98, 1.02], [1, 1, 1]])
    ]),
    clip('Wake', 1, [
      quaternionTrack('RigRoot.quaternion', [0, 0.45, 1], 'z', [0.68, 0.22, 0]),
      vectorTrack('RigRoot.position', [0, 0.45, 1], [[0, -0.48, 0], [0, -0.16, 0], [0, 0, 0]])
    ]),
    clip('Happy', 1.2, [
      vectorTrack('RigRoot.position', [0, 0.3, 0.6, 0.9, 1.2], [[0, 0, 0], [0, 0.3, 0], [0, 0, 0], [0, 0.3, 0], [0, 0, 0]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, -1.65, -1.5, 0]),
      quaternionTrack('RightArm.quaternion', [0, 0.3, 0.9, 1.2], 'z', [0, 1.65, 1.5, 0])
    ]),
    clip('Angry', 1, [
      quaternionTrack('Body.quaternion', [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1], 'z', [0, -0.08, 0.08, -0.08, 0.08, -0.05, 0]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, 0.7, 0.7, 0]),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.75, 1], 'z', [0, -0.7, -0.7, 0])
    ]),
    clip('Jump', 0.95, [
      vectorTrack('RigRoot.position', [0, 0.14, 0.48, 0.78, 0.95], [[0, 0, 0], [0.06, -0.07, 0], [0.16, 0.72, 0], [0.26, 0.2, 0], [0.32, 0, 0]]),
      vectorTrack('Body.scale', [0, 0.14, 0.48, 0.78, 0.95], [[1, 1, 1], [1.1, 0.84, 1.04], [0.96, 1.09, 0.98], [1.06, 0.9, 1.02], [1, 1, 1]]),
      quaternionTrack('LeftArm.quaternion', [0, 0.25, 0.7, 0.95], 'z', [0, -1.45, -1.45, 0]),
      quaternionTrack('RightArm.quaternion', [0, 0.25, 0.7, 0.95], 'z', [0, 1.45, 1.45, 0])
    ]),
    clip('Wave', 1.35, [
      quaternionTrack('RightArm.quaternion', [0, 0.2, 0.42, 0.64, 0.86, 1.08, 1.35], 'z', [0, 2.45, 2.72, 2.35, 2.72, 2.45, 0]),
      quaternionTrack('Head.quaternion', [0, 0.3, 1.05, 1.35], 'z', [0, -0.1, -0.08, 0]),
      quaternionTrack('Body.quaternion', [0, 0.3, 1.05, 1.35], 'z', [0, -0.025, -0.025, 0])
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

function quaternionTrack(name, times, axis, angles) {
  const direction =
    axis === 'x'
      ? new Vector3(1, 0, 0)
      : axis === 'y'
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1)
  const values = angles.flatMap((angle) =>
    new Quaternion().setFromAxisAngle(direction, angle).toArray()
  )

  return new QuaternionKeyframeTrack(name, times, values)
}
