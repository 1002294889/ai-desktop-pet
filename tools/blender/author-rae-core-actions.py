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


def solve_arm_targets(
    armature: bpy.types.Object,
    source: dict[str, BoneTransform],
    targets: dict[str, tuple[float, float, float]],
) -> dict[str, BoneTransform]:
    """Bake two-bone Blender IK results into a regular keyed pose.

    Targets are expressed in armature-local space and are used only while the
    source .blend is authored. The exported Actions contain ordinary skeletal
    keyframes and no runtime IK constraints.
    """

    armature.animation_data.action = None
    for bone_name, transform in source.items():
        bone = armature.pose.bones[bone_name]
        bone.rotation_mode = "QUATERNION"
        bone.location = transform.location
        bone.rotation_quaternion = transform.rotation
        bone.scale = transform.scale
    bpy.context.view_layer.update()

    temporary: list[
        tuple[bpy.types.PoseBone, bpy.types.Constraint, bpy.types.Object]
    ] = []
    for side, target_location in targets.items():
        target = bpy.data.objects.new(f"RaeArmTarget.{side}", None)
        bpy.context.collection.objects.link(target)
        target.matrix_world.translation = armature.matrix_world @ Vector(target_location)
        lower_arm = armature.pose.bones[f"LowerArm.{side}"]
        constraint = lower_arm.constraints.new("IK")
        constraint.name = f"RaeArmPlacement.{side}"
        constraint.target = target
        constraint.chain_count = 2
        constraint.use_tail = True
        temporary.append((lower_arm, constraint, target))

    bpy.context.view_layer.update()
    solved_matrices = {
        bone_name: armature.pose.bones[bone_name].matrix.copy()
        for side in targets
        for bone_name in (f"UpperArm.{side}", f"LowerArm.{side}")
    }

    for lower_arm, constraint, target in temporary:
        lower_arm.constraints.remove(constraint)
        bpy.data.objects.remove(target, do_unlink=True)
    for bone_name, matrix in solved_matrices.items():
        armature.pose.bones[bone_name].matrix = matrix
    bpy.context.view_layer.update()

    pose = {name: transform.copy() for name, transform in source.items()}
    for bone_name in solved_matrices:
        bone = armature.pose.bones[bone_name]
        pose[bone_name] = BoneTransform(
            bone.location.copy(),
            bone.rotation_quaternion.copy(),
            bone.scale.copy(),
        )
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
        rotations={
            "Torso": (12, 0, 0),
            "Head": (-7, 0, 0),
            "UpperArm.L": (6, 0, 6),
            "UpperArm.R": (6, 0, -6),
            "LowerArm.L": (5, 0, 8),
            "LowerArm.R": (5, 0, -8),
        },
        locations={"Body": (0, -0.13, 0.015)},
    )
    takeoff = adjusted_pose(
        jump[2],
        rotations={
            "Torso": (-5, 0, 0),
            "UpperArm.L": (-8, 0, -8),
            "UpperArm.R": (-8, 0, 8),
        },
        locations={"Body": (0, 0.035, 0)},
    )
    apex = adjusted_pose(
        airborne[1],
        rotations={
            "UpperArm.L": (-15, 0, -12),
            "UpperArm.R": (-15, 0, 12),
            "LowerArm.L": (7, -4, -4),
            "LowerArm.R": (7, 4, 4),
            "UpperLeg.L": (9, 0, -5),
            "UpperLeg.R": (15, 0, 7),
            "LowerLeg.L": (15, 0, 4),
            "LowerLeg.R": (22, 0, -5),
            "Head": (6, 0, 0),
        },
        locations={"Body": (0, 0.11, 0)},
    )
    compression = adjusted_pose(
        landing[2],
        rotations={
            "Torso": (11, 0, 0),
            "Head": (-6, 0, 0),
            "UpperArm.L": (5, 0, 6),
            "UpperArm.R": (5, 0, -6),
        },
        locations={"Body": (0, -0.11, 0.01)},
    )
    rebound = adjusted_pose(
        idle,
        rotations={"Torso": (-2, 0, 0), "Head": (2, 0, 0)},
        locations={"Body": (0, 0.025, 0)},
    )

    return create_action(
        armature,
        "RaeJump",
        [
            (1, idle),
            (5, blend_pose(idle, jump[0], 0.7)),
            (12, anticipation),
            (17, takeoff),
            (21, jump[3]),
            (25, airborne[0]),
            (33, apex),
            (40, airborne[2]),
            (45, landing[0]),
            (50, landing[1]),
            (56, compression),
            (61, landing[3]),
            (66, rebound),
            (72, idle),
        ],
        (1, 12, 33, 72),
    )


def seated_pose(
    armature: bpy.types.Object, sources: dict[str, bpy.types.Action]
) -> tuple[dict[str, BoneTransform], dict[str, BoneTransform]]:
    idle = capture_pose(armature, sources["Idle"], 0)
    seated = adjusted_pose(
        idle,
        rotations={
            "Hips": (-12, 0, 0),
            "Abdomen": (8, 0, 0),
            "Torso": (4, 0, 0),
            "Neck": (-1, 0, 0),
            "Head": (-3, 0, 0),
            "UpperLeg.L": (-78, 0, -8),
            "UpperLeg.R": (-78, 0, 8),
            "LowerLeg.L": (116, 0, 4),
            "LowerLeg.R": (116, 0, -4),
        },
        locations={
            "Body": (0, -0.45, 0.085),
            "Foot.L": (-0.18, 0.43, 0.055),
            "Foot.R": (0.18, 0.43, 0.055),
        },
    )
    seated = solve_arm_targets(
        armature,
        seated,
        {
            "L": (0.5, -0.31, 0.55),
            "R": (-0.5, -0.31, 0.55),
        },
    )
    return idle, seated


def author_sit(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    idle, seated = seated_pose(armature, sources)
    preparation = blend_pose(idle, seated, 0.34)
    lowering = blend_pose(idle, seated, 0.7)
    settling = adjusted_pose(
        seated,
        rotations={"Torso": (1.5, 0, 0), "Head": (-1.5, 0, 1)},
        locations={"Body": (0, 0.012, 0)},
    )
    return create_action(
        armature,
        "RaeSit",
        [
            (1, idle),
            (10, preparation),
            (20, lowering),
            (32, seated),
            (44, settling),
            (56, seated),
        ],
        (1, 20, 32, 56),
    )


def sleep_transition_poses(
    armature: bpy.types.Object, sources: dict[str, bpy.types.Action]
) -> dict[str, dict[str, BoneTransform]]:
    idle, seated = seated_pose(armature, sources)
    sleeping = adjusted_pose(
        seated,
        rotations={
            "Body": (0, 0, 82),
            "Hips": (6, 0, -6),
            "Abdomen": (5, 0, 0),
            "Torso": (4, 0, 0),
            "Neck": (-5, 0, -5),
            "Head": (-8, 0, -9),
            "UpperLeg.L": (21, 0, -14),
            "UpperLeg.R": (29, 0, 16),
            "LowerLeg.L": (24, 0, 7),
            "LowerLeg.R": (33, 0, -9),
        },
        locations={
            "Body": (0.13, -0.26, 0.025),
            "Foot.L": (-0.16, -0.04, 0.02),
            "Foot.R": (0.2, -0.06, 0.03),
        },
    )
    # The lower shoulder is intentionally close to the floor in the side-rest
    # silhouette. Tuck that paw beside the head so the wrist cannot pass below
    # the ground plane while the upper paw remains relaxed over the torso.
    sleeping = solve_arm_targets(
        armature,
        sleeping,
        {"R": (-0.62, -0.25, 0.12)},
    )

    kneeling = blend_pose(idle, seated, 0.78)
    supported_lean = adjusted_pose(
        blend_pose(seated, sleeping, 0.22),
        rotations={
            "Body": (0, 0, -5),
            "Torso": (5, 0, 0),
            "Head": (-3, 0, -2),
            "UpperArm.L": (5, 0, -6),
            "LowerArm.L": (8, 0, 12),
        },
        locations={"Body": (0.02, -0.035, 0)},
    )
    supported_side = adjusted_pose(
        blend_pose(seated, sleeping, 0.56),
        rotations={
            "Torso": (3, 0, 0),
            "Neck": (-2, 0, -2),
            "Head": (-4, 0, -4),
            "UpperArm.L": (4, 0, -5),
            "LowerArm.L": (6, 0, 10),
        },
        locations={"Body": (0.035, -0.055, 0)},
    )
    relaxed = adjusted_pose(
        sleeping,
        rotations={"Torso": (-1.2, 0, 0), "Head": (1.2, 0, 1)},
        locations={"Body": (0, 0.01, 0)},
    )
    return {
        "idle": idle,
        "kneeling": kneeling,
        "seated": seated,
        "supported_lean": supported_lean,
        "supported_side": supported_side,
        "sleeping": sleeping,
        "relaxed": relaxed,
    }


def author_sleep(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    poses = sleep_transition_poses(armature, sources)
    return create_action(
        armature,
        "RaeSleep",
        [
            (1, poses["idle"]),
            (16, poses["kneeling"]),
            (30, poses["seated"]),
            (48, poses["supported_lean"]),
            (66, poses["supported_side"]),
            (84, poses["sleeping"]),
            (98, poses["relaxed"]),
            (108, poses["sleeping"]),
        ],
        (1, 48, 84, 108),
    )


def author_wake(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    poses = sleep_transition_poses(armature, sources)
    stirring = adjusted_pose(
        poses["sleeping"],
        rotations={
            "Head": (8, 0, -3),
            "Neck": (4, 0, -2),
            "UpperArm.R": (-5, 0, -8),
        },
        locations={"Body": (0, 0.025, 0)},
    )
    upright_settle = blend_pose(poses["seated"], poses["idle"], 0.45)
    return create_action(
        armature,
        "RaeWake",
        [
            (1, poses["sleeping"]),
            (12, stirring),
            (28, poses["supported_side"]),
            (44, poses["supported_lean"]),
            (60, poses["seated"]),
            (74, upright_settle),
            (86, poses["idle"]),
            (94, poses["idle"]),
        ],
        (1, 28, 60, 94),
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
    scene.frame_end = 108
    scene["rae_core_actions"] = "RaeJump,RaeSit,RaeSleep,RaeWake"
    scene["rae_authored_fps"] = 30
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
    print(f"Authored Rae core Actions in {output_path}")


if __name__ == "__main__":
    main()
