"""Render four review poses for each authored Rae Action from Blender."""

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


EXPECTED_ACTIONS = ("RaeJump", "RaeSit", "RaeSleep", "RaeWake")


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--actions",
        default=",".join(EXPECTED_ACTIONS),
        help="Comma-separated Blender Action names to review",
    )
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def find_armature() -> bpy.types.Object:
    armatures = [item for item in bpy.data.objects if item.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature, found {len(armatures)}")
    return armatures[0]


def point_at(item: bpy.types.Object, target: Vector) -> None:
    item.rotation_euler = (target - item.location).to_track_quat("-Z", "Y").to_euler()


def configure_review_scene() -> bpy.types.Scene:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("RaeReviewWorld")
    scene.world.color = (0.035, 0.045, 0.065)

    for item in list(bpy.data.objects):
        if item.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(item, do_unlink=True)

    camera_data = bpy.data.cameras.new("RaeReviewCamera")
    camera = bpy.data.objects.new("RaeReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.7, -8.1, 2.7)
    camera_data.lens = 64
    point_at(camera, Vector((0.0, 0.0, 1.12)))
    scene.camera = camera

    key_data = bpy.data.lights.new("RaeReviewKey", "AREA")
    key_data.energy = 850
    key_data.shape = "DISK"
    key_data.size = 4.0
    key = bpy.data.objects.new("RaeReviewKey", key_data)
    bpy.context.collection.objects.link(key)
    key.location = (-3.6, -4.2, 6.0)
    point_at(key, Vector((0.0, 0.0, 1.1)))

    fill_data = bpy.data.lights.new("RaeReviewFill", "AREA")
    fill_data.energy = 520
    fill_data.size = 4.0
    fill = bpy.data.objects.new("RaeReviewFill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (4.2, -1.8, 3.5)
    point_at(fill, Vector((0.0, 0.0, 1.0)))

    rim_data = bpy.data.lights.new("RaeReviewRim", "AREA")
    rim_data.energy = 700
    rim_data.size = 3.0
    rim = bpy.data.objects.new("RaeReviewRim", rim_data)
    bpy.context.collection.objects.link(rim)
    rim.location = (0.0, 3.0, 4.8)
    point_at(rim, Vector((0.0, 0.0, 1.2)))

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0.0, 0.0, -0.015))
    floor = bpy.context.object
    floor.name = "RaeReviewFloor"
    floor_material = bpy.data.materials.new("RaeReviewFloorMaterial")
    floor_material.diffuse_color = (0.055, 0.065, 0.085, 1.0)
    floor.data.materials.append(floor_material)
    return scene


def review_frames(action: bpy.types.Action) -> list[int]:
    configured = action.get("review_frames")
    if isinstance(configured, str):
        frames = [int(value.strip()) for value in configured.split(",")]
        if len(frames) == 4:
            return frames

    first, last = (int(round(value)) for value in action.frame_range)
    span = last - first
    return [first, first + span // 3, first + (span * 2) // 3, last]


def main() -> None:
    options = script_arguments()
    output = options.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    armature = find_armature()
    scene = configure_review_scene()
    armature.animation_data_create()

    action_names = [
        name.strip() for name in options.actions.split(",") if name.strip()
    ]
    if not action_names:
        raise RuntimeError("At least one Action must be selected for review")

    for action_name in action_names:
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise RuntimeError(f"Missing Action {action_name}")

        armature.animation_data.action = action
        for index, frame in enumerate(review_frames(action), start=1):
            scene.frame_set(frame)
            scene.render.filepath = str(
                output / f"{action_name}-{index}-frame-{frame:03d}.png"
            )
            bpy.ops.render.render(write_still=True)
            print(f"Rendered {scene.render.filepath}")


if __name__ == "__main__":
    main()
