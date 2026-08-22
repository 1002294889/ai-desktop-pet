"""Validate and export artist-authored Rae Actions as one animation-only GLB."""

import argparse
import sys
from pathlib import Path

import bpy


EXPECTED_ACTIONS = ("RaeJump", "RaeSit", "RaeSleep", "RaeWake")
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


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def find_rae_armature() -> bpy.types.Object:
    matches = []
    for candidate in bpy.data.objects:
        if candidate.type != "ARMATURE":
            continue
        bone_names = {bone.name for bone in candidate.data.bones}
        if EXPECTED_BONES.issubset(bone_names):
            matches.append(candidate)

    if len(matches) != 1:
        raise RuntimeError(f"Expected one Rae armature, found {len(matches)}")

    armature = matches[0]
    if len(armature.data.bones) != 43:
        raise RuntimeError(
            f"Expected Rae's 43-bone armature, found {len(armature.data.bones)} bones"
        )
    return armature


def action_fcurves(action: bpy.types.Action):
    for layer in action.layers:
        for strip in layer.strips:
            for channel_bag in strip.channelbags:
                yield from channel_bag.fcurves


def validate_action(action: bpy.types.Action, bone_names: set[str]) -> None:
    frame_start, frame_end = action.frame_range
    if frame_end <= frame_start:
        raise RuntimeError(f"{action.name} has no keyed frame range")

    curves = list(action_fcurves(action))
    pose_curves = [curve for curve in curves if curve.data_path.startswith('pose.bones["')]
    object_transform_curves = [
        curve
        for curve in curves
        if curve.data_path in {"location", "rotation_euler", "rotation_quaternion", "scale"}
    ]

    if not pose_curves:
        raise RuntimeError(f"{action.name} has no Pose Mode bone keyframes")
    if object_transform_curves:
        paths = sorted({curve.data_path for curve in object_transform_curves})
        raise RuntimeError(
            f"{action.name} animates the armature object ({', '.join(paths)}); "
            "keyframe pose bones instead"
        )

    for curve in pose_curves:
        bone_name = curve.data_path.split('"', 2)[1]
        if bone_name not in bone_names:
            raise RuntimeError(
                f"{action.name} targets unknown Rae bone {bone_name!r}"
            )


def main() -> None:
    options = script_arguments()
    output_path = options.output.resolve()
    armature = find_rae_armature()
    bone_names = {bone.name for bone in armature.data.bones}

    missing = [name for name in EXPECTED_ACTIONS if bpy.data.actions.get(name) is None]
    if missing:
        raise RuntimeError(f"Missing required Actions: {', '.join(missing)}")

    expected = [bpy.data.actions[name] for name in EXPECTED_ACTIONS]
    for action in expected:
        validate_action(action, bone_names)
        action.use_fake_user = True

    # The script runs in a disposable Blender process. Removing unrelated
    # Actions here filters the exported GLB without modifying the saved .blend.
    for action in list(bpy.data.actions):
        if action.name not in EXPECTED_ACTIONS:
            bpy.data.actions.remove(action)

    if armature.animation_data:
        armature.animation_data.action = None
        for track in list(armature.animation_data.nla_tracks):
            armature.animation_data.nla_tracks.remove(track)

    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object else None
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    output_path.parent.mkdir(parents=True, exist_ok=True)

    result = bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_frame_range=False,
        export_force_sampling=True,
        export_sampling_interpolation_fallback="LINEAR",
        export_anim_single_armature=True,
        export_def_bones=False,
        export_armature_object_remove=False,
        export_leaf_bone=False,
        export_optimize_animation_size=True,
        export_anim_slide_to_zero=True,
        export_rest_position_armature=True,
        export_skins=False,
        export_morph=False,
        export_yup=True,
        export_apply=False,
    )

    if result != {"FINISHED"} or not output_path.is_file():
        raise RuntimeError(f"Blender did not create {output_path}")

    print(
        f"Exported {output_path} with Actions: {', '.join(EXPECTED_ACTIONS)}. "
        "Run npm run validate:rae-actions -- <path> before installing it."
    )


if __name__ == "__main__":
    main()
