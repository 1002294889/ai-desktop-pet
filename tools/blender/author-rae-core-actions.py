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

    # Preserve the source rig's useful leg compression, then author a cleaner
    # center-of-mass arc and symmetric arm silhouettes around it. The airborne
    # poses deliberately avoid Jump_Idle's forward-reaching hand.
    preparation = adjusted_pose(
        blend_pose(idle, jump[1], 0.48),
        rotations={"Torso": (5, 0, 0), "Head": (-3, 0, 0)},
        locations={"Body": (0, -0.055, 0.008)},
    )
    anticipation = adjusted_pose(
        jump[1],
        rotations={
            "Torso": (15, 0, 0),
            "Head": (-9, 0, 0),
            "UpperLeg.L": (-7, 0, -2),
            "UpperLeg.R": (-7, 0, 2),
            "LowerLeg.L": (10, 0, 2),
            "LowerLeg.R": (10, 0, -2),
        },
        locations={"Body": (0, -0.18, 0.018)},
    )
    anticipation = solve_arm_targets(
        armature,
        anticipation,
        {"L": (0.72, -0.14, 0.88), "R": (-0.72, -0.14, 0.88)},
    )
    takeoff = adjusted_pose(
        jump[2],
        rotations={
            "Torso": (-7, 0, 0),
            "Head": (4, 0, 0),
            "UpperLeg.L": (4, 0, -2),
            "UpperLeg.R": (4, 0, 2),
        },
        locations={"Body": (0, -0.01, 0)},
    )
    takeoff = solve_arm_targets(
        armature,
        takeoff,
        {"L": (0.84, -0.12, 1.42), "R": (-0.84, -0.12, 1.42)},
    )
    liftoff = adjusted_pose(
        jump[3],
        rotations={"Torso": (-4, 0, 0), "Head": (3, 0, 0)},
        locations={"Body": (0, 0.065, 0)},
    )
    liftoff = solve_arm_targets(
        armature,
        liftoff,
        {"L": (0.82, -0.16, 1.52), "R": (-0.82, -0.16, 1.52)},
    )
    apex = adjusted_pose(
        blend_pose(jump[3], airborne[1], 0.58),
        rotations={
            "Torso": (-3, 0, 0),
            "Head": (5, 0, 0),
            "UpperLeg.L": (12, 0, -6),
            "UpperLeg.R": (19, 0, 7),
            "LowerLeg.L": (23, 0, 5),
            "LowerLeg.R": (29, 0, -7),
        },
        locations={"Body": (0, 0.15, 0)},
    )
    apex = solve_arm_targets(
        armature,
        apex,
        {"L": (0.74, -0.2, 1.62), "R": (-0.74, -0.2, 1.62)},
    )
    descending = adjusted_pose(
        blend_pose(apex, landing[0], 0.48),
        rotations={"Torso": (3, 0, 0), "Head": (-2, 0, 0)},
        locations={"Body": (0, 0.055, 0)},
    )
    descending = solve_arm_targets(
        armature,
        descending,
        {"L": (0.82, -0.15, 1.42), "R": (-0.82, -0.15, 1.42)},
    )
    contact = adjusted_pose(
        landing[1],
        rotations={"Torso": (5, 0, 0), "Head": (-3, 0, 0)},
        locations={"Body": (0, -0.025, 0)},
    )
    contact = solve_arm_targets(
        armature,
        contact,
        {"L": (0.76, -0.13, 0.92), "R": (-0.76, -0.13, 0.92)},
    )
    compression = adjusted_pose(
        landing[2],
        rotations={
            "Torso": (14, 0, 0),
            "Head": (-8, 0, 0),
            "UpperLeg.L": (-5, 0, -2),
            "UpperLeg.R": (-5, 0, 2),
            "LowerLeg.L": (8, 0, 2),
            "LowerLeg.R": (8, 0, -2),
        },
        locations={"Body": (0, -0.15, 0.015)},
    )
    compression = solve_arm_targets(
        armature,
        compression,
        {"L": (0.68, -0.14, 0.78), "R": (-0.68, -0.14, 0.78)},
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
            (6, preparation),
            (14, anticipation),
            (19, takeoff),
            (24, liftoff),
            (34, apex),
            (43, descending),
            (50, contact),
            (58, compression),
            (64, landing[3]),
            (69, rebound),
            (76, idle),
        ],
        (14, 34, 58, 76),
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

    kneeling = blend_pose(idle, seated, 0.76)
    weight_shift = adjusted_pose(
        blend_pose(seated, sleeping, 0.12),
        rotations={
            "Torso": (3, 0, 0),
            "Head": (-2, 0, -1),
        },
        locations={"Body": (0.015, -0.015, 0)},
    )
    weight_shift = solve_arm_targets(
        armature,
        weight_shift,
        {"R": (-0.58, -0.31, 0.24)},
    )
    weight_shift = adjusted_pose(
        weight_shift,
        rotations={"LowerArm.R": (0, -20, 0)},
    )
    hand_contact = adjusted_pose(
        blend_pose(seated, sleeping, 0.24),
        rotations={
            "Torso": (5, 0, 0),
            "Neck": (-2, 0, -2),
            "Head": (-3, 0, -2),
        },
        locations={"Body": (0.025, -0.035, 0)},
    )
    hand_contact = solve_arm_targets(
        armature,
        hand_contact,
        {"R": (-0.68, -0.31, 0.16)},
    )
    hand_contact = adjusted_pose(
        hand_contact,
        rotations={"LowerArm.R": (0, -55, 0)},
    )
    supported_lowering = adjusted_pose(
        blend_pose(seated, sleeping, 0.44),
        rotations={
            "Torso": (5, 0, 0),
            "Neck": (-3, 0, -3),
            "Head": (-5, 0, -4),
        },
        locations={"Body": (0.045, -0.065, 0)},
    )
    supported_lowering = solve_arm_targets(
        armature,
        supported_lowering,
        {"R": (-0.69, -0.29, 0.15)},
    )
    supported_lowering = adjusted_pose(
        supported_lowering,
        rotations={"LowerArm.R": (0, -65, 0)},
    )
    supported_side = adjusted_pose(
        blend_pose(seated, sleeping, 0.68),
        rotations={
            "Torso": (3, 0, 0),
            "Neck": (-3, 0, -3),
            "Head": (-5, 0, -5),
        },
        locations={"Body": (0.05, -0.075, 0)},
    )
    supported_side = solve_arm_targets(
        armature,
        supported_side,
        {"R": (-0.66, -0.27, 0.14)},
    )
    supported_side = adjusted_pose(
        supported_side,
        rotations={"LowerArm.R": (0, -70, 0)},
    )
    resting = adjusted_pose(
        sleeping,
        rotations={
            "Abdomen": (-1, 0, 0),
            "Torso": (-1.5, 0, 0),
            "Neck": (1, 0, 0),
            "Head": (1.5, 0, 1),
        },
        locations={"Body": (0, 0.012, 0)},
    )
    return {
        "idle": idle,
        "kneeling": kneeling,
        "seated": seated,
        "weight_shift": weight_shift,
        "hand_contact": hand_contact,
        "supported_lowering": supported_lowering,
        "supported_side": supported_side,
        "sleeping": sleeping,
        "resting": resting,
    }


def author_sleep(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    poses = sleep_transition_poses(armature, sources)
    return create_action(
        armature,
        "RaeSleep",
        [
            (1, poses["idle"]),
            (14, blend_pose(poses["idle"], poses["kneeling"], 0.48)),
            (28, poses["kneeling"]),
            (42, poses["seated"]),
            (55, poses["weight_shift"]),
            (68, poses["hand_contact"]),
            (84, poses["supported_lowering"]),
            (101, poses["supported_side"]),
            (116, poses["sleeping"]),
            (126, poses["resting"]),
            (134, poses["resting"]),
        ],
        (1, 68, 101, 134),
    )


def author_wake(armature: bpy.types.Object, sources: dict[str, bpy.types.Action]):
    poses = sleep_transition_poses(armature, sources)
    stirring = adjusted_pose(
        poses["resting"],
        rotations={
            "Head": (8, 0, -3),
            "Neck": (4, 0, -2),
            "UpperArm.R": (-5, 0, -8),
        },
        locations={"Body": (0, 0.025, 0)},
    )
    upright_settle = blend_pose(poses["kneeling"], poses["idle"], 0.52)
    return create_action(
        armature,
        "RaeWake",
        [
            (1, poses["resting"]),
            (12, stirring),
            (28, poses["sleeping"]),
            (44, poses["supported_side"]),
            (60, poses["supported_lowering"]),
            (76, poses["hand_contact"]),
            (90, poses["weight_shift"]),
            (104, poses["seated"]),
            (118, upright_settle),
            (130, poses["idle"]),
            (138, poses["idle"]),
        ],
        (1, 60, 104, 138),
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
    scene.frame_end = 138
    scene["rae_core_actions"] = "RaeJump,RaeSit,RaeSleep,RaeWake"
    scene["rae_authored_fps"] = 30
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
    print(f"Authored Rae core Actions in {output_path}")


if __name__ == "__main__":
    main()
