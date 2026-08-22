# Rae Blender Animation Workflow

This workflow replaces Rae's temporary `Jump`, `Sit`, `Sleep`, and `Wake`
motion with artist-authored clips made on Rae's actual armature. It does not
retarget another character and does not generate poses in application code.

The application already expects one external animation-only file:

```text
characters/rae-red-panda/assets/animations/rae-actions.glb
```

It must contain these exact, case-sensitive glTF clip names:

```text
RaeJump
RaeSit
RaeSleep
RaeWake
```

`character.json` already maps the semantic actions `jump`, `sit`, `sleep`, and
`wake` to those clips. Replacing the GLB therefore requires no runtime or
manifest change.

## Prepare the authoring file

On macOS with Blender 5.2 installed at the standard location, run from the
repository root:

```bash
mkdir -p characters/rae-red-panda/blender/work
/Applications/Blender.app/Contents/MacOS/Blender \
  --background \
  --factory-startup \
  --python tools/blender/prepare-rae-animation-workspace.py \
  -- \
  --model characters/rae-red-panda/assets/rae-red-panda.glb \
  --output characters/rae-red-panda/blender/work/rae-animation-workspace.blend
```

The helper imports Rae's existing model, verifies the 43-bone
`CharacterArmature`, removes imported animation data from the authoring copy,
sets 30 fps, opens the armature in Pose Mode, and saves a local `.blend`. It
does not create or keyframe any pose. The ignored `blender/work/` directory is
for local artist files and preview exports.

The same setup can be performed manually: import
`assets/rae-red-panda.glb` using **File → Import → glTF 2.0**, keep the imported
armature and mesh unchanged, remove the imported Actions from the working copy,
and set the scene to 30 fps.

## Author the four Actions

1. Select `CharacterArmature` and enter **Pose Mode**.
2. Open **Dope Sheet → Action Editor**.
3. Create one Action at a time with the exact names `RaeJump`, `RaeSit`,
   `RaeSleep`, and `RaeWake`.
4. Enable **Fake User** for every Action so inactive clips remain in the file.
5. Keyframe pose-bone location/rotation/scale as needed. Do not animate the
   `CharacterArmature` object's transform and do not rename bones.
6. Use Rae's imported rest pose and mesh while reviewing deformation at the
   shoulders, elbows, wrists/fingers, hips, knees, and feet.
7. Start each one-shot clip in a pose that can cross-fade cleanly from the
   preceding action. End `RaeJump` and `RaeWake` near idle. Keep `RaeSit` and
   `RaeSleep` internally loopable because the manifest holds those actions.

Rae's main authoring chain is:

```text
Root
└── Body
    ├── Hips → Abdomen → Torso → Neck → Head
    │                         ├── Shoulder.L → UpperArm.L → LowerArm.L → fingers
    │                         └── Shoulder.R → UpperArm.R → LowerArm.R → fingers
    ├── UpperLeg.L → LowerLeg.L
    └── UpperLeg.R → LowerLeg.R
```

`Foot.L`, `Foot.R`, `PoleTarget.L`, and `PoleTarget.R` are control/root-level
bones in this source rig. Preserve that hierarchy. Keep desktop translation
out of the animation: the application owns window movement and applies its
existing root-motion lock. For vertical jump and lying/sitting offsets, animate
appropriate pose bones such as `Body`/`Hips`, not the armature object.

### Required motion design

- `RaeJump`: anticipation, hip/knee compression, takeoff, readable airborne
  pose, landing compression, recovery to idle.
- `RaeSit`: lower the hips, bend the knees, settle into a stable seated base,
  and place both arms naturally.
- `RaeSleep`: deliberately transition into a comfortable curled or side-resting
  pose. Reposition and relax both arms and legs; the silhouette must not read as
  a fall or injury. The held portion should loop with only subtle breathing.
- `RaeWake`: begin at the exact `RaeSleep` resting pose, unfold naturally, rise,
  and recover to idle.

## Export and validate

Save the `.blend`, close interactive Blender, then export from a clean
background process so only the four required Actions are included:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background \
  characters/rae-red-panda/blender/work/rae-animation-workspace.blend \
  --python tools/blender/export-rae-actions.py \
  -- \
  --output characters/rae-red-panda/blender/work/rae-actions-authored.glb
```

The helper uses glTF Binary (`.glb`), Actions mode, 30 fps source timing,
forced sampling, linear fallback interpolation, Y-up conversion, animation
optimization, rest-pose armature export, no leaf bones, no armature-object
removal, no skin/mesh export, and animation time shifted to zero. It rejects
empty Actions, wrong bone names, and armature-object transform animation.

Validate binding compatibility against the shipped Rae model:

```bash
npm run validate:rae-actions -- \
  characters/rae-red-panda/blender/work/rae-actions-authored.glb
```

After visual review in Blender and in Electron, replace the tracked temporary
runtime file with the validated export:

```bash
cp characters/rae-red-panda/blender/work/rae-actions-authored.glb \
  characters/rae-red-panda/assets/animations/rae-actions.glb
npm run validate:rae-actions
```

The runtime path remains:

```text
semantic action → Rae clip → AnimationMixer → CrossFade → mixer completion → PetActionController
```

No retarget mapping is needed because these Actions are authored and exported
on Rae's own skeleton. The existing LookAt and root-motion processing remain in
the renderer after the external clip is loaded.
