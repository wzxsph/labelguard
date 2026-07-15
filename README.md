<div align="center">
  <p><strong>LABELGUARD</strong><br /><sub>A use-specific quality gate for autonomous-driving labels</sub></p>
  <h1>Qualify the snapshot—not the promise.</h1>
  <p>
    Bind deterministic checks, reviewable evidence, remediation and human sign-off<br />
    to one immutable dataset candidate and one declared downstream use.
  </p>
  <p>
    <a href="https://autoinsight-labelguard.pages.dev/"><strong>◉ OPEN LIVE DEMO</strong></a>
    &nbsp;·&nbsp;
    <a href="README.zh-CN.md"><strong>中文说明</strong></a>
    &nbsp;·&nbsp;
    <a href="docs/product-solution.md">Product solution</a>
    &nbsp;·&nbsp;
    <a href="docs/validation-report.md">Validation report</a>
  </p>
  <p>
    <code>DATA_QA</code>&nbsp;
    <code>IMMUTABLE SNAPSHOT</code>&nbsp;
    <code>ISSUECLUSTER</code>&nbsp;
    <code>HUMAN SIGN-OFF</code>
  </p>
</div>

<table>
  <tr>
    <td align="center"><strong>3</strong><br /><sub>real nuScenes frames</sub></td>
    <td align="center"><strong>9</strong><br /><sub>target observations</sub></td>
    <td align="center"><strong>5</strong><br /><sub>declared synthetic QA perturbations</sub></td>
    <td align="center"><strong>3</strong><br /><sub>reviewable IssueClusters</sub></td>
    <td align="center"><strong>1</strong><br /><sub>qualified use: simulation seed</sub></td>
  </tr>
</table>

## Product interface

<p align="center">
  <a href="https://autoinsight-labelguard.pages.dev/">
    <picture>
      <img src="docs/assets/labelguard-1440x900.png" width="100%" alt="LabelGuard v2 IssueCluster review at 1440 by 900 showing a real nuScenes frame, candidate 2D and 3D-projection overlays, an optional demo reference, a deterministic Mock second opinion, evidence IDs and human disposition controls" />
    </picture>
  </a>
</p>

<p align="center"><sub>Actual 1440 × 900 capture of the online v2 IssueCluster review: real nuScenes media, candidate 2D / candidate 3D projection, optional demo reference and deterministic Mock remain visibly separated beside evidence-linked human disposition controls.</sub></p>

## The decision LabelGuard owns

LabelGuard is the `DATA_QA` execution route in the SceneQL data-supply workflow. It does **not** claim that a dataset is universally “correct,” replace an annotation platform or treat a vision model as ground truth. It answers one narrower, operationally useful question:

> **Is this exact candidate snapshot qualified for this declared downstream use, under this versioned Quality Profile?**

The answer is useful to four roles at once: the QA Owner gets an auditable sign-off gate; the data-production manager gets consolidated remediation scope; the supplier gets evidence-linked instructions; and the data consumer gets a machine-readable, use-limited receipt.

## The quality gate

<table>
  <tr>
    <td align="center" width="25%">
      <sub>01 · BIND</sub><br />
      <strong>Declare the decision</strong><br />
      <sub>intended use · Quality Profile · scope · source SHA-256</sub>
    </td>
    <td align="center" width="25%">
      <sub>02 · DETECT</sub><br />
      <strong>Run deterministic QA</strong><br />
      <sub>candidate geometry · projection · track continuity · sensor support</sub>
    </td>
    <td align="center" width="25%">
      <sub>03 · DECIDE</sub><br />
      <strong>Review IssueClusters</strong><br />
      <sub>target / track evidence · closed spec clauses · human decision</sub>
    </td>
    <td align="center" width="25%">
      <sub>04 · RELEASE</sub><br />
      <strong>Recheck and sign</strong><br />
      <sub>new snapshot · remediation trace · QA Owner · manifest + callback</sub>
    </td>
  </tr>
  <tr>
    <td align="center">work-order preflight<br /><strong>READY</strong></td>
    <td align="center">repeated findings<br /><strong>ISSUECLUSTER</strong></td>
    <td align="center">resolved on a new digest<br /><strong>AWAITING_SIGNOFF</strong></td>
    <td align="center">explicit human approval<br /><strong>QUALIFIED</strong></td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><strong>↳ FAIL CLOSED</strong><br /><sub>missing work-order field → <code>NEEDS_CLARIFICATION</code></sub></td>
    <td align="center"><strong>↳ INVALIDATE STALE WORK</strong><br /><sub>digest changed → <code>SNAPSHOT_CHANGED</code>; previous decisions cannot be reused</sub></td>
    <td align="center"><strong>↳ LIMIT THE CLAIM</strong><br /><sub>a manifest applies only to its signed snapshot, use and Quality Profile</sub></td>
  </tr>
</table>

## Real evidence, frame by frame

The public fixture is built from three adjacent nuScenes v1.0-mini `scene-0061` `CAM_FRONT` keyframes. These are real road-collected images; the controlled QA perturbations used to exercise the workflow are separately marked as synthetic.

<table>
  <tr>
    <td width="33%"><img src="public/demo/nuscenes-scene-0061-cam-front-14.jpg" width="100%" alt="nuScenes scene-0061 CAM_FRONT keyframe 14 approaching a road-work junction" /></td>
    <td width="33%"><img src="public/demo/nuscenes-scene-0061-cam-front-15.jpg" width="100%" alt="nuScenes scene-0061 CAM_FRONT keyframe 15 beside a construction zone" /></td>
    <td width="33%"><img src="public/demo/nuscenes-scene-0061-cam-front-16.jpg" width="100%" alt="nuScenes scene-0061 CAM_FRONT keyframe 16 continuing past a construction vehicle" /></td>
  </tr>
  <tr>
    <td align="center"><sub>KEYFRAME 14 · CAM_FRONT</sub></td>
    <td align="center"><sub>KEYFRAME 15 · CAM_FRONT</sub></td>
    <td align="center"><sub>KEYFRAME 16 · CAM_FRONT</sub></td>
  </tr>
</table>

<p align="center"><sub>Derived from nuScenes v1.0-mini for a non-commercial demonstration. Dataset terms and attribution are preserved in <a href="public/demo/LICENSE">public/demo/LICENSE</a>.</sub></p>

## Evidence is layered, not blended

<table>
  <thead>
    <tr>
      <th align="left">Layer</th>
      <th align="left">Source</th>
      <th align="left">Role in the review</th>
      <th align="center">May decide qualification?</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>🟢 <strong>Real media</strong></td>
      <td>nuScenes-derived camera frames</td>
      <td>Observable scene evidence</td>
      <td align="center"><strong>No</strong></td>
    </tr>
    <tr>
      <td>🟠 <strong>Candidate annotation</strong></td>
      <td><code>candidate2d</code>, <code>candidate3d</code>, candidate projection</td>
      <td>The production-like object under QA</td>
      <td align="center"><strong>No</strong></td>
    </tr>
    <tr>
      <td>🔵 <strong>Demo reference</strong></td>
      <td>Optional official nuScenes annotation, <code>demoOnly</code></td>
      <td>Explains the fixture; production schema does not require it</td>
      <td align="center"><strong>No</strong></td>
    </tr>
    <tr>
      <td>🟣 <strong>Second opinion</strong></td>
      <td>Deterministic Mock in the public build</td>
      <td>Informational comparison; missing output does not block this profile</td>
      <td align="center"><strong>No</strong></td>
    </tr>
    <tr>
      <td>⚪ <strong>Human decision</strong></td>
      <td>QA Owner + evidence-linked review bundle</td>
      <td>Confirms disposition and explicitly signs the qualified use</td>
      <td align="center"><strong>Yes</strong></td>
    </tr>
  </tbody>
</table>

## Snapshot and sign-off invariants

<table>
  <tr>
    <td align="center"><strong>S₀ · CANDIDATE</strong><br /><sub>canonical dataset SHA-256</sub></td>
    <td align="center">→<br /><sub>review</sub></td>
    <td align="center"><strong>DECISION BUNDLE</strong><br /><sub>IssueClusters · evidence IDs · spec-clause IDs</sub></td>
    <td align="center">→<br /><sub>remediate</sub></td>
    <td align="center"><strong>S₁ · CORRECTED</strong><br /><sub>new digest + scoped target diff</sub></td>
    <td align="center">→<br /><sub>sign</sub></td>
    <td align="center"><strong>MANIFEST</strong><br /><sub>S₁ + intended use + reviewer identity</sub></td>
  </tr>
</table>

- The work-order digest must match the computed candidate content digest before QA starts.
- Human decisions are bound to `S₀`; they are never silently carried across snapshots.
- A valid recheck requires a **new canonical SHA-256** and a target-level mapping to the remediation scope.
- Passing deterministic checks produces `AWAITING_SIGNOFF`, not automatic qualification.
- Any snapshot, decision or review-bundle change invalidates the previous signature.

## Where AI helps—and where it stops

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>AI-assisted</h3>
      <ul>
        <li>Compress evidence from one IssueCluster into a short summary</li>
        <li>Map supplied evidence to allowed, closed-set spec-clause IDs</li>
        <li>Draft one remediation scope and one recheck plan</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>Deterministic or human-owned</h3>
      <ul>
        <li>Measurements, thresholds, projections and track checks</li>
        <li>Label truth, severity disposition and remediation approval</li>
        <li>Snapshot mutation, use qualification and QA Owner sign-off</li>
      </ul>
    </td>
  </tr>
</table>

The public site always uses a reproducible deterministic Mock and labels it as such. Optional MiniMax-M3 runs only on the server, receives structured IssueCluster context rather than images, and must cite supplied evidence and clause IDs. Invalid JSON, missing citations or invented IDs fail closed.

## Demo scope and honest limits

Five explicitly declared synthetic perturbations yield two systematic blocking clusters and one informational Mock-disagreement cluster. The demo exercises `simulation_seed` qualification only. Its one-click corrected-snapshot receipt is also explicitly synthetic; a production deployment must import and verify a real corrected snapshot.

This fixture demonstrates the workflow, evidence linkage, snapshot invariants and product contracts. It does **not** validate production thresholds, sampling strategy, model accuracy or commercial dataset rights.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, plus Python 3 for fixture-generator syntax validation.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:4175>.

Production-style server:

```bash
npm run build
npm run serve
```

Open <http://127.0.0.1:4176>.

## Verify the product contract

```bash
npm run check
```

The suite covers work-order preflight, stale-snapshot rejection, systematic clustering, independence from demo GT, non-blocking missing-model output, remediation and recheck state, true SHA-256 manifests, SceneQL task/result contracts, public-data provenance and a production build.

<details>
  <summary><strong>Deploy the static public demo</strong></summary>
  <br />
  <p>The hosted demo is intentionally client-only and deterministic. Build without an environment file or remote-AI mode:</p>

```bash
npm ci
npm run check
```

  <p>Publish <code>dist/</code> as the Cloudflare Pages output directory. <code>public/_headers</code> and <code>public/_redirects</code> are copied into the build. On static hosting, unavailable <code>/api/*</code> calls fail closed; no API key, MiniMax-M3 endpoint or server runtime is shipped.</p>
</details>

<details>
  <summary><strong>Run the optional MiniMax-M3 assistant</strong></summary>
  <br />
  <p>Remote mode is locked to <code>MiniMax-M3</code> and remains server-only:</p>

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run serve
```

  <p>The authorized environment defines <code>OPENAI_API_KEY</code> and <code>OPENAI_BASE_URL</code>. No credential enters the browser bundle or status response.</p>

```bash
LABELGUARD_ENV_FILE=/path/to/authorized.env \
LABELGUARD_AI_MODE=remote \
npm run test:llm
```

  <p>The credential-safe smoke prints only the model name, IssueCluster ID, citation counts and schema result.</p>
</details>

<details>
  <summary><strong>Inspect cross-product contracts</strong></summary>
  <br />

  <table>
    <tr><td><strong>Input</strong></td><td><code>data-supply-task/1.0</code> · <code>TASK-LG-WZ-001</code></td></tr>
    <tr><td><strong>Provider spec</strong></td><td><code>label-qa-work-order/1.0</code></td></tr>
    <tr><td><strong>Manifest</strong></td><td><code>label-quality-manifest/1.0</code></td></tr>
    <tr><td><strong>Callback</strong></td><td><code>data-supply-result/1.0</code> · <code>provider=LabelGuard</code></td></tr>
  </table>

  <p>Canonical constructors and validators are exported from <a href="src/domain.mjs"><code>src/domain.mjs</code></a>. The common demo references <code>DEM-WZ-001@1.0</code> and the same three nuScenes sample tokens used by SceneQL.</p>
</details>

<details>
  <summary><strong>Data, license and fixture regeneration</strong></summary>
  <br />
  <p>nuScenes-derived assets remain subject to CC BY-NC-SA 4.0 and the additional nuScenes Dataset Terms; see <a href="public/demo/LICENSE"><code>public/demo/LICENSE</code></a>. This repository does not grant commercial dataset rights.</p>

```bash
python3 scripts/generate-nuscenes-demo.py \
  --dataset-root /path/to/nuscenes/dataset
```
</details>

<details>
  <summary><strong>Repository map</strong></summary>
  <br />

- [`src/domain.mjs`](src/domain.mjs) — work-order preflight, deterministic QA, clustering and qualification contracts
- [`src/assistant.mjs`](src/assistant.mjs) — deterministic cluster Mock and closed-citation validator
- [`src/app.mjs`](src/app.mjs) — work order, evidence review, remediation and qualification UI
- [`server/`](server/) — static server and optional MiniMax-M3 endpoint
- [`public/demo/`](public/demo/) — nuScenes-derived public fixture, task and license notice
- [`tests/`](tests/) — domain, AI-boundary, provenance and cross-repository contract tests
</details>

<p align="center">
  <strong>Make the release claim smaller, clearer and auditable.</strong><br />
  <sub>Source code is available under the <a href="LICENSE">MIT License</a>. Dataset assets retain their own terms.</sub>
</p>
