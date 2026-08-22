# Rae Red Panda Companion Asset Notice

The visible character in `assets/rae-red-panda.glb` is
`Astronaut_RaeTheRedPanda` by Quaternius, from the
[Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html).

The source pack is dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Attribution is not required by CC0, but is included here to preserve clear
provenance and credit the artist.

The self-contained source glTF was acquired from the pack's documented public
distribution via this
[GitHub mirror](https://github.com/danvanderboom/Aetherium/blob/main/samples/unity/Aphelion/Assets/ThirdParty/Quaternius/Animated/reclaimer-rae.gltf).
Its SHA-256 before repackaging was
`521d5fe5e82ac2c0b5a709599205b93b1a3d709373404f95e07b8ffa38f72079`.

Repository modifications are limited to:

- repackaging the self-contained glTF as a binary GLB;
- disabling the separate pistol mesh and retaining its node as an invisible
  right-hand prop socket;
- selecting and mapping animations in `character.json`.

The visible character mesh contains 5,684 triangles. The GLB contains one
512x512 RGBA atlas texture, one material, one 43-joint skin, and 18 original
embedded animation clips. The unused pistol geometry remains in the binary for
source-layout stability but is not instantiated or rendered.

`assets/animations/rae-actions.glb` is an original motion-only asset generated
for this repository by `tools/generate-rae-actions.mjs`. It contains
target-rig skeletal clips for jump, sit, sleep, and wake; it contains no mesh,
material, or texture. The sleep clip includes a subtle breathing loop and the
wake clip begins from the exact sleeping pose before unfolding to idle.

`assets/animations/celebrate.glb` and `groove-a-pose.glb` are original CC0
development motion assets from this repository. They are loaded only as
animation sources, retargeted onto Rae's rig, and disposed after their clips
are prepared. Their character geometry is never rendered as part of this pack.
