# LabelGuard public demo fixture

This directory contains a non-commercial demonstration derived from three adjacent nuScenes v1.0-mini `scene-0061` `CAM_FRONT` keyframes.

## Contract

- `dataSupplyTask`: canonical `data-supply-task/1.0` input shared with SceneQL;
- `labelQAWorkOrder`: `label-qa-work-order/1.0` provider spec;
- `batch.contentDigest`: immutable SHA-256 of only the dataset candidate (`schemaVersion`, `batch` without the digest, and `frames`);
- `qualityProfile`: versioned rules for the single `simulation_seed` intended use;
- `demoRecheck`: explicitly synthetic new-snapshot receipt for UI demonstration.

## Data layers

| Field | Source | Meaning |
| --- | --- | --- |
| `frame.image` | nuScenes-derived JPEG | Real road-collected media |
| `candidate2d` / `candidate3d` | Derived candidate label | Production-like fields under QA |
| `candidateProjection2d` | Candidate 3D projection using referenced calibration | Deterministic association check input |
| `demoReferenceAnnotation` | Official nuScenes annotation | Optional `demoOnly` reference; never a production requirement |
| `qaPerturbation` | Deterministic synthetic mutation | Exercises QA rules; not a real nuScenes error |
| `modelCandidate` | Deterministic Mock | Informational second opinion; not real inference |

Five synthetic perturbations produce two repeated projection findings, two repeated dimension findings and one informational Mock disagreement. Missing model output is not a default risk.

The JPEGs and nuScenes-derived metadata remain governed by the terms in [`LICENSE`](LICENSE). This fixture is not a commercial dataset license and does not establish production quality thresholds.
