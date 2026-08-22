"""Create a clean Rae animation-authoring .blend without inventing any poses."""

import argparse
import sys
from pathlib import Path

import bpy


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
EXPECTED_ACTIONS = ("RaeJump", "RaeSit", "RaeSleep", "RaeWake")


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
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


def clear_imported_animation() -> None:
    for item in bpy.data.objects:
        item.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def add_workspace_notes() -> None:
    notes = bpy.data.texts.new("RAE_ANIMATION_WORKFLOW")
    notes.write(
        "Author these Actions on CharacterArmature: "
        + ", ".join(EXPECTED_ACTIONS)
        + ".\n"
        "Do not rename the armature or bones. Do not animate the armature object's "
        "transform. Use Pose Mode bone keyframes and export through "
        "tools/blender/export-rae-actions.py.\n"
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
    armature = find_rae_armature()
    clear_imported_animation()

    scene = bpy.context.scene
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    scene.frame_start = 1
    scene.frame_end = 120
    scene["rae_expected_actions"] = ",".join(EXPECTED_ACTIONS)
    scene["rae_runtime_asset"] = "assets/animations/rae-actions.glb"
    add_workspace_notes()

    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object else None
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path))

    print(
        f"Prepared {output_path} with {len(armature.data.bones)} Rae bones at "
        f"{scene.render.fps} fps. No animation poses were generated."
    )


if __name__ == "__main__":
    main()
