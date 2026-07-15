# LabelGuard

[**▶ Live Demo**](https://autoinsight-labelguard.pages.dev/) · [中文说明](README.zh-CN.md)

Use-specific label quality qualification gate for autonomous-driving dataset candidates.

LabelGuard is the `DATA_QA` execution route in the SceneQL data-supply workflow. It does not claim that a dataset is universally “correct.” It answers a narrower, auditable question: **is this immutable candidate snapshot qualified for the declared downstream use?**

## Workflow

1. receive a versioned `data-supply-task/1.0` from SceneQL;
2. preflight the `label-qa-work-order/1.0`, intended use, quality profile and snapshot digest;
3. run deterministic candidate-label checks and group repeated findings into `IssueCluster` objects;
4. review the actual target and track evidence against closed spec-clause IDs;
5. route confirmed issues to annotation rework, expert arbitration, data-readiness repair or more evidence;
6. recheck a new immutable snapshot after remediation;
7. sign a use-specific `label-quality-manifest/1.0` and return `data-supply-result/1.0` to SceneQL.

Missing required work-order fields return `NEEDS_CLARIFICATION`. A changed dataset digest returns `SNAPSHOT_CHANGED`; previous human decisions cannot be reused.

## Public demo

The public fixture uses three adjacent nuScenes v1.0-mini `scene-0061` `CAM_FRONT` keyframes and nine target observations. It keeps four layers separate:

| Layer | Meaning |
| --- | --- |
| Real media | Downsampled nuScenes camera frames |
| Candidate annotation | Production-like `candidate2d`, `candidate3d` and `candidateProjection2d` fields |
| Demo reference | Optional official nuScenes annotation, marked `demoOnly`; not required by the production schema |
| Second opinion | Deterministic Mock prediction; missing or disagreeing output does not block this Quality Profile |

Five deterministic QA perturbations are explicitly marked `synthetic`. Two repeated projection findings and two repeated dimension findings form systematic issue clusters. One Mock class disagreement remains informational.

The demo Quality Profile is valid only for `simulation_seed`. The one-click recheck receipt is also explicitly synthetic; a production deployment must verify a real corrected snapshot.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, plus Python 3 for fixture-generator syntax validation.

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:4175`.

Production-style server:

```bash
npm run build
npm run serve
```

Open `http://127.0.0.1:4176`.

## Deploy as a static public demo

The hosted demo is intentionally a client-only, deterministic Mock. Build it without an environment file or remote-AI mode:

```bash
npm ci
npm run check
```

Publish `dist/` as the Cloudflare Pages output directory. The repository's `public/_headers` and `public/_redirects` are copied into the build automatically. On static hosting, unavailable `/api/*` requests fail closed and the UI explicitly reports `Mock · deterministic`; no API key, MiniMax-M3 endpoint or server runtime is required or shipped.

## Verification

```bash
npm run check
```

The suite checks work-order preflight, stale snapshot rejection, systematic clustering, production-schema independence from demo GT, non-blocking missing model output, remediation/recheck state, true SHA-256 manifests, SceneQL task/result contracts, public-data provenance and a production build.

## MiniMax-M3 mode

Public mode is a deterministic Mock. Optional remote mode is server-only and locked to `MiniMax-M3`:

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run serve
```

The authorized environment defines `OPENAI_API_KEY` and `OPENAI_BASE_URL`. No credential enters the browser bundle or status response.

MiniMax-M3 only drafts an IssueCluster summary, a remediation scope and a recheck plan. Its response must cite the supplied evidence IDs and spec-clause IDs; invalid JSON, missing citations or invented IDs fail closed. Deterministic code retains measurements, thresholds, routes, snapshot checks and qualification decisions.

Credential-safe smoke:

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run test:llm
```

The smoke prints only the model name, issue-cluster ID, citation counts and schema result.

## Cross-product contracts

- input: `data-supply-task/1.0` / `TASK-LG-WZ-001`;
- provider spec: `label-qa-work-order/1.0`;
- manifest: `label-quality-manifest/1.0`;
- callback: `data-supply-result/1.0` with `provider=LabelGuard`.

Canonical constructors and validators are exported from [`src/domain.mjs`](src/domain.mjs). The common demo references `DEM-WZ-001@1.0` and the exact three nuScenes scene-0061 sample tokens shared with SceneQL.

## Data and license

nuScenes-derived assets remain subject to CC BY-NC-SA 4.0 and the additional nuScenes Dataset Terms; see [`public/demo/LICENSE`](public/demo/LICENSE). This repository does not grant commercial dataset rights.

Regenerate the derived fixture after obtaining nuScenes v1.0-mini under its terms:

```bash
python3 scripts/generate-nuscenes-demo.py \
  --dataset-root /path/to/nuscenes/dataset
```

## Project map

- `src/domain.mjs` — work-order preflight, deterministic QA, clustering and qualification contracts
- `src/assistant.mjs` — deterministic cluster Mock and closed-citation validator
- `src/app.mjs` — work order, issue review and qualification UI
- `server/` — static server and optional MiniMax-M3 endpoint
- `public/demo/` — nuScenes-derived public fixture, task and license notice
- `tests/` — domain, AI-boundary, provenance and cross-repo contract tests

Source code is available under the [MIT License](LICENSE).
