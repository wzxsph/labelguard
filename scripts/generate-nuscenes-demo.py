#!/usr/bin/env python3
"""Build the public LabelGuard fixture from three nuScenes mini keyframes.

The source dataset is never modified. Human GT fields are copied from the
official nuScenes metadata and projected with the published sensor calibration.
Synthetic QA perturbations and deterministic Mock predictions are added as
separate, explicitly labelled layers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image


SCENE_NAME = "scene-0061"
SAMPLE_TOKENS = [
    "2afb9d32310e4546a71cbe432911eca2",
    "cd21dbfc3bd749c7b10a5c42562e0c42",
    "88449a5cb1644a199c1c11f6ac034867",
]
TRACKS = {
    "CAR": {
        "instanceToken": "c1958768d48640948f6053d04cffd35b",
        "class": "car",
    },
    "CV": {
        "instanceToken": "e3c5b72c12c34c85aac247734ad83bef",
        "class": "construction_vehicle",
    },
    "CW": {
        "instanceToken": "71603dd1a2ba4e9daf095535e38310ac",
        "class": "construction_worker",
    },
}
OUTPUT_SIZE = (1280, 720)


def load_table(metadata_root: Path, name: str) -> list[dict[str, Any]]:
    return json.loads((metadata_root / f"{name}.json").read_text(encoding="utf-8"))


def by_token(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {record["token"]: record for record in records}


def rotation_matrix(quaternion: list[float]) -> list[list[float]]:
    w, x, y, z = quaternion
    return [
        [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
        [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
        [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y],
    ]


def global_yaw(quaternion: list[float]) -> float:
    """Return the z-axis yaw of a nuScenes global-frame quaternion."""
    w, x, y, z = quaternion
    return round(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)), 6)


def mat_vec(matrix: list[list[float]], point: list[float]) -> list[float]:
    return [sum(matrix[row][column] * point[column] for column in range(3)) for row in range(3)]


def transpose(matrix: list[list[float]]) -> list[list[float]]:
    return [[matrix[column][row] for column in range(3)] for row in range(3)]


def add(left: list[float], right: list[float]) -> list[float]:
    return [left[index] + right[index] for index in range(3)]


def subtract(left: list[float], right: list[float]) -> list[float]:
    return [left[index] - right[index] for index in range(3)]


def project_annotation(
    annotation: dict[str, Any],
    calibrated_sensor: dict[str, Any],
    ego_pose: dict[str, Any],
    source_size: tuple[int, int],
) -> tuple[dict[str, float], list[dict[str, float]]]:
    width, length, height = annotation["size"]
    local_corners = [
        [sx * length / 2, sy * width / 2, sz * height / 2]
        for sx, sy, sz in [
            (1, 1, 1),
            (1, -1, 1),
            (1, -1, -1),
            (1, 1, -1),
            (-1, 1, 1),
            (-1, -1, 1),
            (-1, -1, -1),
            (-1, 1, -1),
        ]
    ]

    box_rotation = rotation_matrix(annotation["rotation"])
    ego_inverse = transpose(rotation_matrix(ego_pose["rotation"]))
    camera_inverse = transpose(rotation_matrix(calibrated_sensor["rotation"]))
    intrinsic = calibrated_sensor["camera_intrinsic"]
    projected: list[dict[str, float]] = []

    for corner in local_corners:
        global_point = add(mat_vec(box_rotation, corner), annotation["translation"])
        ego_point = mat_vec(ego_inverse, subtract(global_point, ego_pose["translation"]))
        camera_point = mat_vec(camera_inverse, subtract(ego_point, calibrated_sensor["translation"]))
        if camera_point[2] <= 0.1:
            raise ValueError(f"Annotation {annotation['token']} has a corner behind CAM_FRONT")
        pixel = mat_vec(intrinsic, camera_point)
        projected.append({"x": pixel[0] / pixel[2], "y": pixel[1] / pixel[2]})

    source_width, source_height = source_size
    x_min = max(0.0, min(point["x"] for point in projected))
    y_min = max(0.0, min(point["y"] for point in projected))
    x_max = min(float(source_width), max(point["x"] for point in projected))
    y_max = min(float(source_height), max(point["y"] for point in projected))
    if x_max <= x_min or y_max <= y_min:
        raise ValueError(f"Annotation {annotation['token']} is outside CAM_FRONT")

    scale_x = OUTPUT_SIZE[0] / source_width
    scale_y = OUTPUT_SIZE[1] / source_height
    box = {
        "x": round(x_min * scale_x, 2),
        "y": round(y_min * scale_y, 2),
        "width": round((x_max - x_min) * scale_x, 2),
        "height": round((y_max - y_min) * scale_y, 2),
    }
    corners = [
        {"x": round(point["x"] * scale_x, 2), "y": round(point["y"] * scale_y, 2)}
        for point in projected
    ]
    return box, corners


def derived_velocity(
    annotation: dict[str, Any],
    annotations: dict[str, dict[str, Any]],
    samples: dict[str, dict[str, Any]],
) -> float:
    previous = annotations.get(annotation.get("prev", ""))
    following = annotations.get(annotation.get("next", ""))
    if previous and following:
        left, right = previous, following
    elif previous:
        left, right = previous, annotation
    elif following:
        left, right = annotation, following
    else:
        return 0.0
    delta_seconds = (
        samples[right["sample_token"]]["timestamp"] - samples[left["sample_token"]]["timestamp"]
    ) / 1_000_000
    distance = math.dist(left["translation"][:2], right["translation"][:2])
    return round(distance / delta_seconds, 3) if delta_seconds > 0 else 0.0


def inset_box(box: dict[str, float]) -> dict[str, float]:
    return {
        "x": round(box["x"] + box["width"] * 0.018, 2),
        "y": round(box["y"] + box["height"] * 0.012, 2),
        "width": round(box["width"] * 0.965, 2),
        "height": round(box["height"] * 0.975, 2),
    }


def normalized(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalized(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def canonical_json(value: Any) -> bytes:
    return json.dumps(normalized(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def build(dataset_root: Path, output_root: Path) -> dict[str, Any]:
    metadata_root = dataset_root / "v1.0-mini"
    samples = by_token(load_table(metadata_root, "sample"))
    sample_data_records = load_table(metadata_root, "sample_data")
    calibrated_sensors = by_token(load_table(metadata_root, "calibrated_sensor"))
    sensors = by_token(load_table(metadata_root, "sensor"))
    ego_poses = by_token(load_table(metadata_root, "ego_pose"))
    annotations = by_token(load_table(metadata_root, "sample_annotation"))
    instances = by_token(load_table(metadata_root, "instance"))
    categories = by_token(load_table(metadata_root, "category"))
    attributes = by_token(load_table(metadata_root, "attribute"))
    scenes = {record["name"]: record for record in load_table(metadata_root, "scene")}

    camera_data: dict[str, dict[str, Any]] = {}
    for record in sample_data_records:
        calibrated = calibrated_sensors[record["calibrated_sensor_token"]]
        channel = sensors[calibrated["sensor_token"]]["channel"]
        if record["is_key_frame"] and channel == "CAM_FRONT":
            camera_data[record["sample_token"]] = record

    annotations_by_sample_instance = {
        (record["sample_token"], record["instance_token"]): record
        for record in annotations.values()
    }
    output_root.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, Any]] = []
    selected_camera_data = [camera_data[token] for token in SAMPLE_TOKENS]

    for sequence_index, sample_token in enumerate(SAMPLE_TOKENS):
        frame_index = sequence_index + 14
        sample = samples[sample_token]
        camera = camera_data[sample_token]
        calibrated = calibrated_sensors[camera["calibrated_sensor_token"]]
        ego_pose = ego_poses[camera["ego_pose_token"]]
        source_path = dataset_root / camera["filename"]
        output_name = f"nuscenes-{SCENE_NAME}-cam-front-{frame_index}.jpg"
        output_path = output_root / output_name

        left_index = max(0, sequence_index - 1)
        right_index = min(len(selected_camera_data) - 1, sequence_index + 1)
        left_camera = selected_camera_data[left_index]
        right_camera = selected_camera_data[right_index]
        left_pose = ego_poses[left_camera["ego_pose_token"]]
        right_pose = ego_poses[right_camera["ego_pose_token"]]
        ego_delta_seconds = (right_camera["timestamp"] - left_camera["timestamp"]) / 1_000_000
        ego_speed = round(
            math.dist(left_pose["translation"][:2], right_pose["translation"][:2]) / ego_delta_seconds,
            3,
        )

        with Image.open(source_path) as image:
            source_size = image.size
            image.convert("RGB").resize(OUTPUT_SIZE, Image.Resampling.LANCZOS).save(
                output_path,
                format="JPEG",
                quality=86,
                optimize=True,
                progressive=True,
            )

        targets: list[dict[str, Any]] = []
        for track_key, track in TRACKS.items():
            annotation = annotations_by_sample_instance[(sample_token, track["instanceToken"])]
            instance = instances[annotation["instance_token"]]
            category_name = categories[instance["category_token"]]["name"]
            attribute_names = [attributes[token]["name"] for token in annotation["attribute_tokens"]]
            gt_box, projected_corners = project_annotation(annotation, calibrated, ego_pose, source_size)
            velocity = derived_velocity(annotation, annotations, samples)
            candidate_box = dict(gt_box)
            candidate_box3d = {
                "length": round(annotation["size"][1], 3),
                "width": round(annotation["size"][0], 3),
                "height": round(annotation["size"][2], 3),
                "yaw": global_yaw(annotation["rotation"]),
                "yawReference": "global_frame_z_axis_radians",
            }
            model_candidate: dict[str, Any] | None = {
                "provenance": "deterministic_mock_not_model_inference",
                "class": track["class"],
                "score": 0.92,
                "box2d": inset_box(gt_box),
            }
            qa_perturbation: dict[str, Any] | None = None
            candidate_velocity = velocity

            if track_key == "CAR" and frame_index == 15:
                candidate_box["x"] = round(candidate_box["x"] + 130, 2)
                qa_perturbation = {
                    "id": "MUT-CAR-15-BOX-SHIFT",
                    "synthetic": True,
                    "layer": "candidate_annotation",
                    "field": "candidate2d.x",
                    "operation": "add_130px_after_downsample",
                    "baselineValue": gt_box["x"],
                    "candidateValue": candidate_box["x"],
                    "purpose": "exercise_projection_alignment_rule",
                }
            elif track_key == "CAR" and frame_index == 16:
                candidate_box["x"] = round(candidate_box["x"] + 120, 2)
                qa_perturbation = {
                    "id": "MUT-CAR-16-BOX-SHIFT",
                    "synthetic": True,
                    "layer": "candidate_annotation",
                    "field": "candidate2d.x",
                    "operation": "add_120px_after_downsample",
                    "baselineValue": gt_box["x"],
                    "candidateValue": candidate_box["x"],
                    "purpose": "exercise_systematic_projection_cluster",
                }
            elif track_key == "CV" and frame_index == 14:
                baseline_length = candidate_box3d["length"]
                candidate_box3d["length"] = 0.8
                qa_perturbation = {
                    "id": "MUT-CV-14-LENGTH",
                    "synthetic": True,
                    "layer": "candidate_annotation",
                    "field": "candidate3d.length",
                    "operation": "replace_with_0.8m",
                    "baselineValue": baseline_length,
                    "candidateValue": 0.8,
                    "purpose": "exercise_systematic_schema_export_cluster",
                }
            elif track_key == "CV" and frame_index == 15:
                baseline_length = candidate_box3d["length"]
                candidate_box3d["length"] = 0.8
                qa_perturbation = {
                    "id": "MUT-CV-15-LENGTH",
                    "synthetic": True,
                    "layer": "candidate_annotation",
                    "field": "candidate3d.length",
                    "operation": "replace_with_0.8m",
                    "baselineValue": baseline_length,
                    "candidateValue": 0.8,
                    "purpose": "exercise_class_dimension_rule",
                }
            elif track_key == "CW" and frame_index == 15:
                model_candidate["class"] = "car"
                model_candidate["score"] = 0.61
                qa_perturbation = {
                    "id": "MUT-CW-15-MOCK-CLASS",
                    "synthetic": True,
                    "layer": "mock_model_candidate",
                    "field": "modelCandidate.class",
                    "operation": "replace_with_car",
                    "baselineValue": "not_applicable_no_real_inference_run",
                    "candidateValue": "car",
                    "purpose": "exercise_model_disagreement_signal",
                }

            target_id = f"NS-{track_key}-{frame_index}"
            targets.append(
                {
                    "id": target_id,
                    "trackId": f"NS-{track_key}-{track['instanceToken'][:8]}",
                    "class": track["class"],
                    "attributes": attribute_names,
                    "candidate2d": candidate_box,
                    "candidateProjection2d": gt_box,
                    "candidateProjectionCorners2d": projected_corners,
                    "candidate3d": candidate_box3d,
                    "lidarPoints": annotation["num_lidar_pts"],
                    "radarPoints": annotation["num_radar_pts"],
                    "candidateVelocityMps": candidate_velocity,
                    "modelCandidate": model_candidate,
                    "qaPerturbation": qa_perturbation,
                    "demoReferenceAnnotation": {
                        "demoOnly": True,
                        "provenance": "official_nuscenes_human_3d_annotation",
                        "sampleAnnotationToken": annotation["token"],
                        "instanceToken": annotation["instance_token"],
                        "category": category_name,
                        "attributeNames": attribute_names,
                        "visibilityToken": annotation["visibility_token"],
                        "translationGlobal": annotation["translation"],
                        "sizeWlh": annotation["size"],
                        "rotationGlobalWxyz": annotation["rotation"],
                        "numLidarPts": annotation["num_lidar_pts"],
                        "numRadarPts": annotation["num_radar_pts"],
                        "projectedBox2d": gt_box,
                        "derivedPlanarVelocityMps": velocity,
                        "velocityMethod": "centered_annotation_translation_difference",
                    },
                }
            )

        frames.append(
            {
                "id": f"NS-FRAME-{frame_index}",
                "timestampMs": round((sample["timestamp"] - samples[SAMPLE_TOKENS[0]]["timestamp"]) / 1000),
                "image": f"/demo/{output_name}",
                "egoSpeedMps": ego_speed,
                "source": {
                    "dataset": "nuScenes v1.0-mini",
                    "sceneName": SCENE_NAME,
                    "sampleToken": sample_token,
                    "sampleDataToken": camera["token"],
                    "calibratedSensorToken": camera["calibrated_sensor_token"],
                    "egoPoseToken": camera["ego_pose_token"],
                    "channel": "CAM_FRONT",
                    "sourceFilename": camera["filename"],
                    "sourceSize": {"width": source_size[0], "height": source_size[1]},
                    "derivedMediaSha256": sha256_file(output_path),
                    "derivation": "RGB resize to 1280x720, Lanczos, progressive JPEG quality 86",
                    "egoSpeedMethod": "planar_difference_of_camera_timestamp_ego_poses",
                },
                "targets": targets,
            }
        )

    payload: dict[str, Any] = {
        "schemaVersion": "labelguard.demo.v3",
        "batch": {
            "id": "BATCH-LG-NUSCENES-0061",
            "name": "nuScenes scene-0061 CAM_FRONT QA Demo",
            "source": "nuScenes v1.0-mini scene-0061",
            "dataNature": "real_media_and_official_human_gt_with_synthetic_qa_perturbations",
            "license": "CC-BY-NC-SA-4.0-plus-nuScenes-Dataset-Terms",
            "licenseUrl": "https://www.nuscenes.org/terms-of-use",
            "publicRelease": True,
            "task": "multi_sensor_3d_annotation_qa",
            "sensorProfile": "nuscenes_cam_front_v1",
            "frameSize": {"width": OUTPUT_SIZE[0], "height": OUTPUT_SIZE[1]},
            "baseLabelVersion": "nuscenes-v1.0-mini-human-gt",
            "candidateLabelVersion": "labelguard-demo-0061-qa-rc1",
            "createdAt": "2026-07-15T08:30:00.000Z",
            "annotationSchema": "labelguard-nuscenes-derived-v3",
            "digestMethod": "sha256-canonical-dataset-candidate-without-batch.contentDigest-and-work-order",
            "notice": "真实 nuScenes CAM_FRONT 图像与官方 human 3D GT 投影；所有 QA 扰动和模型候选均为确定性合成演示，不代表真实标注错误或模型性能。",
            "layers": {
                "media": "real_nuscenes_camera_keyframes_downsampled",
                "demoReferenceAnnotation": "optional_demo_only_official_nuscenes_annotation",
                "candidateAnnotation": "human_gt_baseline_plus_explicit_synthetic_qa_perturbations",
                "modelCandidate": "deterministic_mock_not_real_model_inference",
            },
            "selectedScene": {
                "name": SCENE_NAME,
                "sceneToken": scenes[SCENE_NAME]["token"],
                "sampleTokens": SAMPLE_TOKENS,
                "instanceTokens": [track["instanceToken"] for track in TRACKS.values()],
            },
        },
        "frames": frames,
    }
    payload["batch"]["contentDigest"] = "sha256:" + hashlib.sha256(canonical_json(payload)).hexdigest()
    payload["qualityProfile"] = {
        "id": "QPROF-SIM-SEED-3D",
        "version": "1.0.0",
        "intendedUses": ["simulation_seed"],
        "rules": {
            "BOX_IN_FRAME": {"specClauseId": "SPEC-GEOMETRY-001"},
            "CLASS_DIMENSIONS": {
                "specClauseId": "SPEC-SCHEMA-003",
                "byClass": {
                    "car": {"length": [2.4, 6.5], "width": [1.2, 2.8], "height": [1.0, 2.8]},
                    "construction_vehicle": {"length": [2.0, 12.0], "width": [1.5, 4.5], "height": [1.5, 5.0]},
                    "construction_worker": {"length": [0.2, 1.2], "width": [0.2, 1.2], "height": [1.0, 2.4]},
                },
            },
            "PROJECTION_ALIGNMENT": {"specClauseId": "SPEC-PROJECTION-002", "minIou": 0.55},
            "LIDAR_POINT_SUPPORT": {
                "specClauseId": "SPEC-SENSOR-004",
                "minimumByClass": {"car": 8, "construction_vehicle": 8, "construction_worker": 4},
            },
            "TRACK_ACCELERATION_CONTINUITY": {"specClauseId": "SPEC-TRACK-005", "maxAccelerationMps2": 15},
            "MODEL_CLASS_AGREEMENT": {
                "specClauseId": "SPEC-MODEL-006",
                "blocking": False,
                "allowedByClass": {
                    "car": ["car"],
                    "construction_vehicle": ["construction_vehicle"],
                    "construction_worker": ["construction_worker"],
                },
            },
        },
    }
    payload["specClauses"] = [
        {"id": "SPEC-GEOMETRY-001", "title": "候选 2D 几何边界"},
        {"id": "SPEC-PROJECTION-002", "title": "候选 3D 投影与候选 2D 关联"},
        {"id": "SPEC-SCHEMA-003", "title": "类别尺寸 Schema"},
        {"id": "SPEC-SENSOR-004", "title": "传感器支持只作为风险信号"},
        {"id": "SPEC-TRACK-005", "title": "Track 时序连续性"},
        {"id": "SPEC-MODEL-006", "title": "模型第二意见默认不阻断"},
    ]
    payload["labelQAWorkOrder"] = {
        "schemaVersion": "label-qa-work-order/1.0",
        "provider": "LabelGuard",
        "workOrderId": "LGWO-WZ-0061-001",
        "supplyRequestId": "TASK-LG-WZ-001",
        "demandRef": {"id": "DEM-WZ-001", "version": "1.0"},
        "datasetCandidateId": "NUSCENES-SCENE-0061-WORKZONE-SEED",
        "snapshotDigest": payload["batch"]["contentDigest"],
        "intendedUse": "simulation_seed",
        "candidateLabelVersion": payload["batch"]["candidateLabelVersion"],
        "annotationSchema": payload["batch"]["annotationSchema"],
        "sensorProfile": payload["batch"]["sensorProfile"],
        "qualityProfileRef": {"id": "QPROF-SIM-SEED-3D", "version": "1.0.0"},
        "scope": {
            "frameIds": [frame["id"] for frame in frames],
            "targetIds": [target["id"] for frame in frames for target in frame["targets"]],
        },
        "requester": {"team": "PNC", "role": "data_consumer"},
        "qaOwner": {"team": "Data QA", "role": "qa_owner"},
        "approver": {"team": "Data QA", "role": "quality_approver"},
        "slaDueAt": "2026-07-16T09:00:00.000Z",
        "licenseRef": "public/demo/LICENSE",
    }
    payload["dataSupplyTask"] = {
        "schemaVersion": "data-supply-task/1.0",
        "taskId": "TASK-LG-WZ-001",
        "demandRef": {"id": "DEM-WZ-001", "version": "1.0"},
        "routeDecision": {
            "id": "ROUTE-DATA-QA",
            "type": "DATA_QA",
            "reasonCode": "DATASET_REQUIRES_QA",
            "approvedByRole": "data_product_owner",
            "approvedAt": "2026-07-15T11:00:00+08:00",
        },
        "consumer": {
            "team": "PNC 算法",
            "function": "work_zone_merge",
            "modelVersion": "pnc-2026.07.1",
            "purpose": "regression",
        },
        "inputAssetRefs": [{
            "id": payload["labelQAWorkOrder"]["datasetCandidateId"],
            "version": payload["labelQAWorkOrder"]["candidateLabelVersion"],
            "uri": "labelguard-demo://scene-0061/frames-14-16",
            "snapshotDigest": payload["labelQAWorkOrder"]["snapshotDigest"],
        }],
        "seedRefs": [{
            "kind": "nuscenes_scene",
            "uri": "nuscenes://v1.0-mini/scene-0061",
            "digest": payload["batch"]["contentDigest"],
            "licenseRef": "CC-BY-NC-SA-4.0+nuScenes-Terms",
            "sampleTokens": SAMPLE_TOKENS,
        }],
        "atomicPredicates": [{
            "id": "P-SEED-QUALITY",
            "definitionId": "P-SEED-QUALITY",
            "category": "DATA_READINESS",
            "executorId": "labelguard.quality-gate/1.0",
            "requiredModalities": ["camera", "calibration", "ego_pose", "sample_annotation"],
            "evidenceMaturity": "REQUIRES_QA",
            "missingDataBehavior": "BLOCK_SIMULATION_SEED",
            "version": "1.0",
        }],
        "acceptanceCriteria": [
            {"id": "AC-QA-01", "metric": "mandatory_blockers", "operator": "eq", "value": 0, "unit": "issues", "source": "quality-profile/1.0", "approvedBy": "qa_owner"},
            {"id": "AC-QA-02", "metric": "review_completion", "operator": "eq", "value": 9, "unit": "targets", "source": "work-order-scope", "approvedBy": "qa_owner"},
        ],
        "budget": {"maxTargets": 9, "maxWallTimeMinutes": 30, "reviewPolicy": "exhaustive_demo_batch"},
        "returnRef": {
            "schemaVersion": "data-supply-result/1.0",
            "target": "sceneql://demands/DEM-WZ-001/results",
        },
        "providerSpec": payload["labelQAWorkOrder"],
    }
    payload["demoRecheck"] = {
        "synthetic": True,
        "notice": "One-click recheck is a deterministic synthetic demo receipt, not a corrected nuScenes release.",
        "snapshotDigest": "sha256:" + hashlib.sha256(b"labelguard-demo-recheck-snapshot-v2").hexdigest(),
    }
    output_json = output_root / "labelguard-batch-v1.json"
    output_json.write_text(json.dumps(normalized(payload), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True, help="Path containing v1.0-mini/ and samples/")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public" / "demo",
    )
    arguments = parser.parse_args()
    payload = build(arguments.dataset_root.resolve(), arguments.output_root.resolve())
    print(
        json.dumps(
            {
                "batchId": payload["batch"]["id"],
                "frames": len(payload["frames"]),
                "targets": sum(len(frame["targets"]) for frame in payload["frames"]),
                "digest": payload["batch"]["contentDigest"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
