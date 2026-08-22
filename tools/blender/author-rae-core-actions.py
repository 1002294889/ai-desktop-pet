"""Author Rae's core Actions on her actual Blender armature.

The script composes the source model's artist-authored jump clips and creates
deliberate sit/sleep/wake pose beats directly as Blender Actions. The generated
.blend remains the editable source of truth; exported GLB files are produced by
the separate Phase 5.10 exporter after visual review.
"""

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion, Vector


EXPECTED_BONES = {
    "Root",
    "Body",
    "Hips",
    "Abdomen",
    "Torso",
    "Neck",
    "Head",
    "Shoulder.L",
    "UpperArm.L",
    "LowerArm.L",
    "Shoulder.R",
    "UpperArm.R",
    "LowerArm.R",
    "UpperLeg.L",
    "LowerLeg.L",
    "Foot.L",
    "UpperLeg.R",
    "LowerLeg.R",
    "Foot.R",
}
EXPECTED_SOURCE_ACTIONS = {
    "Idle",
    "Duck",
    "Jump",
    "Jump_Idle",
    "Jump_Land",
}


@dataclass
class BoneTransform:
    location: Vector
    rotation: Quaternion
    scale: Vector

    def copy(self):
        return BoneTransform(
            self.location.copy(), self.rotation.copy(), self.scale.copy()
        )


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def find_armature() -> bpy.types.Object:
    matches = []
    for candidate in bpy.data.objects:
        if candidate.type != "ARMATURE":
            continue
        names = {bone.name for bone in candidate.data.bones}
        if EXPECTED_BONES.issubset(names):
            matches.append(candidate)

    if len(matches) != 1 or len(matches[0].data.bones) != 43:
        raise RuntimeError("Rae's validated 43-bone CharacterArmature was not found")
    return matches[0]


def capture_pose(
    armature: bpy.types.Object, action: bpy.types.Action, frame: float
) -> dict[str, BoneTransform]:
    armature.animation_data.action = action
    bpy.context.scene.frame_set(int(math.floor(frame)), subframe=frame % 1)
    bpy.context.view_layer.update()
    return {
        bone.name: BoneTransform(
            bone.location.copy(),
            bone.rotation_quaternion.copy(),
            bone.scale.copy(),
        )
        for bone in armature.pose.bones
    }


def blend_pose(
    first: dict[str, BoneTransform],
    second: dict[str, BoneTransform],
    amount: float,
) -> dict[str, BoneTransform]:
    pose = {}
    for name, first_transform in first.items():
        second_transform = second[name]
        pose[name] = BoneTransform(
            first_transform.location.lerp(second_transform.location, amount),
            first_transform.rotation.slerp(second_transform.rotation, amount),
            first_transform.scale.lerp(second_transform.scale, amount),
        )
    return pose


def adjusted_pose(
    source: dict[str, BoneTransform],
    rotations: dict[str, tuple[float, float, float]] | None = None,
    locations: dict[str, tuple[float, float, float]] | None = None,
) -> dict[str, BoneTransform]:
    pose = {name: transform.copy() for name, transform in source.items()}

    for bone_name, degrees in (rotations or {}).items():
        delta = Euler(tuple(math.radians(value) for value in degrees), "XYZ")
        pose[bone_name].rotation = pose[bone_name].rotation @ delta.to_quaternion()

    for bone_name, offset in (locations or {}).items():
        pose[bone_name].location += Vector(offset)

    return pose


def create_action(
    armature: bpy.types.Object,
    name: str,
    keyed_poses: list[tuple[int, dict[str, BoneTransform]]],
    review_frames: tuple[int, int, int, int],
) -> bpy.types.Action:
    existing = bpy.data.actions.get(name)
    if existing:
        bpy.data.actions.remove(existing)

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    action["review_frames"] = ",".join(str(frame) for frame in review_frames)
    armature.animation_data.action = action

    for frame, pose in keyed_poses:
        bpy.context.scene.frame_set(frame)
        for bone_name, transform in pose.items():
            bone = armature.pose.bones[bone_name]
            bone.rotation_mode = "QUATERNION"
            bone.location = transform.location
            bone.rotation_quaternion = transform.rotation
            bone.scale = transform.scale
            bone.keyframe_insert("location", frame=frame, group=bone_name)
            bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
            bone.keyframe_insert("scale", frame=frame, group=bone_name)

    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
    return action


def action_fcurves(action: bpy.types.Action):
    for layer in action.layers:
        for strip in layer.strips:
            for channel_bag in strip.channelbags:
                yield from channel_bag.fcurves


def author_jump(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    idle = capture_pose(armature, sources["Idle"], 0)
    jump = [capture_pose(armature, sources["Jump"], frame) for frame in (0, 3, 6, 8.8)]
    airborne = [
        capture_pose(armature, sources["Jump_Idle"], frame)
        for frame in (0, 6, 12)
    ]
    landing = [
        capture_pose(armature, sources["Jump_Land"], frame)
        for frame in (0, 3, 6, 8.8)
    ]

    # Amplify the authored compression and airborne silhouette without relying
    # on root translation alone. All adjustments are pose-bone local offsets.
    anticipation = adjusted_pose(
        jump[1],
        rotations={"Torso": (8, 0, 0), "Head": (-5, 0, 0)},
        locations={"Body": (0, -0.07, 0)},
    )
    apex = adjusted_pose(
        airborne[1],
        rotations={
            "UpperArm.L": (-10, 0, -8),
            "UpperArm.R": (-10, 0, 8),
            "Head": (4, 0, 0),
        },
        locations={"Body": (0, 0.08, 0)},
    )
    compression = adjusted_pose(
        landing[2],
        rotations={"Torso": (7, 0, 0), "Head": (-4, 0, 0)},
        locations={"Body": (0, -0.055, 0)},
    )

    return create_action(
        armature,
        "RaeJump",
        [
            (1, idle),
            (5, blend_pose(idle, jump[0], 0.65)),
            (10, anticipation),
            (15, jump[2]),
            (19, jump[3]),
            (23, airborne[0]),
            (30, apex),
            (36, airborne[2]),
            (41, landing[0]),
            (46, landing[1]),
            (51, compression),
            (56, landing[3]),
            (62, idle),
        ],
        (1, 10, 30, 62),
    )


def seated_pose(
    armature: bpy.types.Object, sources: dict[str, bpy.types.Action]
) -> tuple[dict[str, BoneTransform], dict[str, BoneTransform]]:
    idle = capture_pose(armature, sources["Idle"], 0)
    seated = adjusted_pose(
        idle,
        rotations={
            "Hips": (-8, 0, 0),
            "Abdomen": (6, 0, 0),
            "Torso": (5, 0, 0),
            "Head": (-3, 0, 0),
            "UpperArm.L": (2, -4, -7),
            "UpperArm.R": (2, 4, 7),
            "LowerArm.L": (-8, -8, -16),
            "LowerArm.R": (-8, 8, 16),
            "UpperLeg.L": (-68, 0, -7),
            "UpperLeg.R": (-68, 0, 7),
            "LowerLeg.L": (106, 0, 3),
            "LowerLeg.R": (106, 0, -3),
        },
        locations={
            "Body": (0, -0.38, 0.07),
            "Foot.L": (-0.16, 0.36, 0.07),
            "Foot.R": (0.16, 0.36, 0.07),
        },
    )
    return idle, seated


def author_sit(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    idle, seated = seated_pose(armature, sources)
    preparation = blend_pose(idle, seated, 0.34)
    settling = adjusted_pose(
        seated,
        rotations={"Torso": (2, 0, 0), "Head": (-2, 0, 1)},
        locations={"Body": (0, 0.018, 0)},
    )
    return create_action(
        armature,
        "RaeSit",
        [(1, idle), (10, preparation), (24, seated), (36, settling), (48, seated)],
        (1, 10, 24, 48),
    )


def sleeping_pose(
    armature: bpy.types.Object, sources: dict[str, bpy.types.Action]
) -> tuple[dict[str, BoneTransform], dict[str, BoneTransform]]:
    idle, seated = seated_pose(armature, sources)
    sleeping = adjusted_pose(
        seated,
        rotations={
            "Body": (0, 0, 82),
            "Hips": (4, 0, -5),
            "Abdomen": (4, 0, 0),
            "Torso": (3, 0, 0),
            "Neck": (-4, 0, -4),
            "Head": (-6, 0, -7),
            "UpperArm.L": (2, -6, -20),
            "UpperArm.R": (2, 6, 20),
            "LowerArm.L": (-4, -12, -26),
            "LowerArm.R": (-4, 12, 26),
            "UpperLeg.L": (18, 0, -12),
            "UpperLeg.R": (24, 0, 14),
            "LowerLeg.L": (20, 0, 6),
            "LowerLeg.R": (28, 0, -8),
        },
        locations={
            "Body": (0.12, -0.3, 0.02),
            "Foot.L": (-0.18, -0.06, 0.03),
            "Foot.R": (0.22, -0.08, 0.04),
        },
    )
    return idle, sleeping


def author_sleep(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    idle, seated = seated_pose(armature, sources)
    _, sleeping = sleeping_pose(armature, sources)
    lowering = blend_pose(idle, seated, 0.72)
    side_settle = blend_pose(seated, sleeping, 0.48)
    relaxed = adjusted_pose(
        sleeping,
        rotations={"Torso": (-1.5, 0, 0), "Head": (1.5, 0, 1)},
        locations={"Body": (0, 0.012, 0)},
    )
    return create_action(
        armature,
        "RaeSleep",
        [
            (1, idle),
            (14, lowering),
            (28, seated),
            (44, side_settle),
            (62, sleeping),
            (78, relaxed),
            (90, sleeping),
        ],
        (1, 28, 62, 90),
    )


def author_wake(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    idle, seated = seated_pose(armature, sources)
    _, sleeping = sleeping_pose(armature, sources)
    stirring = adjusted_pose(
        sleeping,
        rotations={
            "Head": (8, 0, -3),
            "Neck": (4, 0, -2),
            "UpperArm.R": (-5, 0, -8),
        },
        locations={"Body": (0, 0.025, 0)},
    )
    rising = blend_pose(sleeping, seated, 0.58)
    crouched = blend_pose(seated, idle, 0.42)
    return create_action(
        armature,
        "RaeWake",
        [
            (1, sleeping),
            (10, stirring),
            (24, rising),
            (38, seated),
            (50, crouched),
            (62, idle),
            (70, idle),
        ],
        (1, 10, 38, 70),
    )


def main() -> None:
    options = script_arguments()
    model_path = options.model.resolve()
    output_path = options.output.resolve()
    if not model_path.is_file():
        raise FileNotFoundError(model_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model_path))
    armature = find_armature()
    armature.animation_data_create()
    sources = {name: bpy.data.actions.get(name) for name in EXPECTED_SOURCE_ACTIONS}
    missing = [name for name, action in sources.items() if action is None]
    if missing:
        raise RuntimeError(f"Missing source Actions: {', '.join(missing)}")

    author_jump(armature, sources)
    author_sit(armature, sources)
    author_sleep(armature, sources)
    author_wake(armature, sources)

    scene = bpy.context.scene
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    scene.frame_start = 1
    scene.frame_end = 90
    scene["rae_core_actions"] = "RaeJump,RaeSit,RaeSleep,RaeWake"
    scene["rae_authored_fps"] = 30
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
    print(f"Authored Rae core Actions in {output_path}")


if __name__ == "__main__":
    main()
