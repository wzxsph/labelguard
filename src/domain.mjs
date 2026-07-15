export const RULESET_VERSION = "labelguard-rules-v2.0.0";
export const WORK_ORDER_SCHEMA = "label-qa-work-order/1.0";
export const QUALITY_MANIFEST_SCHEMA = "label-quality-manifest/1.0";

export const ALLOWED_INTENDED_USES = new Set([
  "simulation_seed",
  "training",
  "evaluation",
  "regression",
]);

const SEVERITY_WEIGHT = {
  critical: 92,
  high: 72,
  medium: 46,
  low: 18,
  info: 8,
};

const RULE_META = {
  BOX_IN_FRAME: {
    category: "geometry",
    severity: "critical",
    route: "ANNOTATION_REWORK",
    specClauseId: "SPEC-GEOMETRY-001",
    title: "候选 2D 框越出图像边界",
  },
  CLASS_DIMENSIONS: {
    category: "schema",
    severity: "high",
    route: "ANNOTATION_REWORK",
    specClauseId: "SPEC-SCHEMA-003",
    title: "候选 3D 尺寸不符合类别约束",
  },
  PROJECTION_ALIGNMENT: {
    category: "projection",
    severity: "high",
    route: "DATA_READINESS_REPAIR",
    specClauseId: "SPEC-PROJECTION-002",
    title: "候选 3D 投影与候选 2D 框关联偏差",
  },
  LIDAR_POINT_SUPPORT: {
    category: "sensor_support",
    severity: "medium",
    route: "NEEDS_MORE_EVIDENCE",
    specClauseId: "SPEC-SENSOR-004",
    title: "LiDAR 支持低于当前质量 Profile",
  },
  TRACK_ACCELERATION_CONTINUITY: {
    category: "temporal",
    severity: "high",
    route: "EXPERT_ARBITRATION",
    specClauseId: "SPEC-TRACK-005",
    title: "同一 track 的候选速度不连续",
  },
  MODEL_CLASS_AGREEMENT: {
    category: "model_disagreement",
    severity: "info",
    route: "NEEDS_MORE_EVIDENCE",
    specClauseId: "SPEC-MODEL-006",
    title: "Mock 第二意见与候选类别不同",
    blocking: false,
  },
};

function between(value, range) {
  return Number.isFinite(value) && value >= range[0] && value <= range[1];
}

function intersectionOverUnion(a, b) {
  if (!a || !b) return 0;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export function sha256Text(value) {
  const bytes = [...new TextEncoder().encode(String(value))];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      words[index] = (
        (bytes[cursor] << 24) |
        (bytes[cursor + 1] << 16) |
        (bytes[cursor + 2] << 8) |
        bytes[cursor + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((item) => item.toString(16).padStart(8, "0")).join("");
}

export function stableHash(value) {
  return "sha256:" + sha256Text(JSON.stringify(canonicalize(value)));
}

export function computeDatasetCandidateDigest(payload) {
  const batch = { ...(payload?.batch ?? {}) };
  delete batch.contentDigest;
  return stableHash({ schemaVersion: payload?.schemaVersion, batch, frames: payload?.frames ?? [] });
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

export function preflightWorkOrder(workOrder, payload) {
  const requiredPaths = [
    "schemaVersion",
    "provider",
    "workOrderId",
    "supplyRequestId",
    "demandRef.id",
    "demandRef.version",
    "datasetCandidateId",
    "snapshotDigest",
    "intendedUse",
    "candidateLabelVersion",
    "annotationSchema",
    "sensorProfile",
    "qualityProfileRef.id",
    "qualityProfileRef.version",
    "scope.frameIds",
    "scope.targetIds",
    "requester.role",
    "qaOwner.role",
    "approver.role",
    "licenseRef",
  ];
  const missingFields = requiredPaths.filter((path) => {
    const value = getPath(workOrder, path);
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  const issues = [];
  if (workOrder?.schemaVersion && workOrder.schemaVersion !== WORK_ORDER_SCHEMA) {
    issues.push("UNSUPPORTED_WORK_ORDER_SCHEMA");
  }
  if (workOrder?.provider && workOrder.provider !== "LabelGuard") issues.push("WRONG_PROVIDER");
  if (workOrder?.intendedUse && !ALLOWED_INTENDED_USES.has(workOrder.intendedUse)) {
    issues.push("UNSUPPORTED_INTENDED_USE");
  }
  if (missingFields.length > 0 || issues.length > 0) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields,
      issues,
      reusableDecisions: false,
    };
  }
  const computedDigest = computeDatasetCandidateDigest(payload);
  if (computedDigest !== payload?.batch?.contentDigest) {
    return {
      status: "SNAPSHOT_CHANGED",
      missingFields: [],
      issues: ["DATASET_CONTENT_DIGEST_INVALID"],
      expectedDigest: payload?.batch?.contentDigest ?? null,
      observedDigest: computedDigest,
      reusableDecisions: false,
    };
  }
  if (workOrder.snapshotDigest !== payload?.batch?.contentDigest) {
    return {
      status: "SNAPSHOT_CHANGED",
      missingFields: [],
      issues: ["DATASET_SNAPSHOT_DIGEST_MISMATCH"],
      expectedDigest: workOrder.snapshotDigest,
      observedDigest: payload?.batch?.contentDigest ?? null,
      reusableDecisions: false,
    };
  }
  if (
    workOrder.candidateLabelVersion !== payload.batch.candidateLabelVersion ||
    workOrder.annotationSchema !== payload.batch.annotationSchema ||
    workOrder.sensorProfile !== payload.batch.sensorProfile ||
    workOrder.qualityProfileRef.id !== payload.qualityProfile?.id ||
    workOrder.qualityProfileRef.version !== payload.qualityProfile?.version
  ) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["WORK_ORDER_DATASET_METADATA_MISMATCH"],
      reusableDecisions: false,
    };
  }
  if (!payload.qualityProfile?.intendedUses?.includes(workOrder.intendedUse)) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["QUALITY_PROFILE_DOES_NOT_SUPPORT_INTENDED_USE"],
      reusableDecisions: false,
    };
  }
  const requiredProfileRules = [
    "BOX_IN_FRAME",
    "CLASS_DIMENSIONS",
    "PROJECTION_ALIGNMENT",
    "LIDAR_POINT_SUPPORT",
    "TRACK_ACCELERATION_CONTINUITY",
    "MODEL_CLASS_AGREEMENT",
  ];
  if (requiredProfileRules.some((rule) => !payload.qualityProfile?.rules?.[rule])) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["QUALITY_PROFILE_RULES_INCOMPLETE"],
      reusableDecisions: false,
    };
  }
  const availableTargets = new Set(
    (payload.frames ?? []).flatMap((frame) => (frame.targets ?? []).map((target) => target.id)),
  );
  const availableFrames = new Set((payload.frames ?? []).map((frame) => frame.id));
  if (
    new Set(workOrder.scope.targetIds).size !== workOrder.scope.targetIds.length ||
    new Set(workOrder.scope.frameIds).size !== workOrder.scope.frameIds.length ||
    workOrder.scope.targetIds.some((id) => !availableTargets.has(id)) ||
    workOrder.scope.frameIds.some((id) => !availableFrames.has(id))
  ) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["WORK_ORDER_SCOPE_INVALID"],
      reusableDecisions: false,
    };
  }
  const scopedClasses = new Set(
    (payload.frames ?? []).flatMap((frame) => frame.targets ?? [])
      .filter((target) => workOrder.scope.targetIds.includes(target.id))
      .map((target) => target.class),
  );
  if ([...scopedClasses].some((className) => (
    !payload.qualityProfile.rules.CLASS_DIMENSIONS.byClass?.[className] ||
    !Number.isFinite(payload.qualityProfile.rules.LIDAR_POINT_SUPPORT.minimumByClass?.[className])
  ))) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["QUALITY_PROFILE_CLASS_THRESHOLDS_INCOMPLETE"],
      reusableDecisions: false,
    };
  }
  const knownClauseIds = new Set((payload.specClauses ?? []).map((item) => item.id));
  if (requiredProfileRules.some((rule) => {
    const clauseId = payload.qualityProfile.rules[rule].specClauseId;
    return !clauseId || !knownClauseIds.has(clauseId);
  })) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: ["QUALITY_PROFILE_SPEC_CLAUSE_INVALID"],
      reusableDecisions: false,
    };
  }
  return {
    status: "READY",
    missingFields: [],
    issues: [],
    reusableDecisions: true,
  };
}

function makeEvidence(target, rule, overrides = {}) {
  const meta = RULE_META[rule];
  return {
    id: `EV-${target.id}-${rule}`,
    targetId: target.id,
    trackId: target.trackId,
    frameId: target.frameId,
    rule,
    severity: overrides.severity ?? meta.severity,
    category: meta.category,
    title: meta.title,
    detail: overrides.detail,
    observed: overrides.observed,
    expected: overrides.expected,
    source: overrides.source,
    specClauseId: overrides.specClauseId ?? meta.specClauseId,
    recommendedRoute: meta.route,
    blocking: overrides.blocking ?? meta.blocking ?? true,
    dataLayer: overrides.dataLayer ?? "candidate_annotation",
    qaPerturbationId: target.qaPerturbation?.id ?? null,
    demoSyntheticPerturbation: Boolean(target.qaPerturbation?.synthetic),
  };
}

export function flattenTargets(payload) {
  return payload.frames.flatMap((frame, frameIndex) =>
    frame.targets.map((target) => ({
      ...target,
      frameId: frame.id,
      frameIndex,
      timestampMs: frame.timestampMs,
      image: frame.image,
      frameSource: frame.source,
      egoSpeedMps: frame.egoSpeedMps,
    })),
  );
}

function clusterKey(evidence) {
  if (["PROJECTION_ALIGNMENT", "CLASS_DIMENSIONS", "TRACK_ACCELERATION_CONTINUITY"].includes(evidence.rule)) {
    return `${evidence.rule}:${evidence.trackId}`;
  }
  return `${evidence.rule}:ALL`;
}

function buildIssueClusters(evidence) {
  const grouped = new Map();
  for (const item of evidence) {
    const key = clusterKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return [...grouped.entries()].map(([signature, items]) => {
    const primary = [...items].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])[0];
    const suffix = signature.replaceAll(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      id: `IC-${suffix}`,
      signature,
      title: primary.title,
      rule: primary.rule,
      category: primary.category,
      severity: primary.severity,
      priorityScore: Math.min(100, SEVERITY_WEIGHT[primary.severity] + Math.max(0, items.length - 1) * 6),
      recommendedRoute: primary.recommendedRoute,
      blocking: items.some((item) => item.blocking),
      systemic: items.length > 1,
      evidenceIds: items.map((item) => item.id).sort(),
      specClauseIds: [...new Set(items.map((item) => item.specClauseId))].sort(),
      targetIds: [...new Set(items.map((item) => item.targetId))].sort(),
      trackIds: [...new Set(items.map((item) => item.trackId))].sort(),
      syntheticDemoEvidence: items.every((item) => item.demoSyntheticPerturbation),
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
}

function profileRule(payload, rule) {
  return payload.qualityProfile?.rules?.[rule] ?? {};
}

export function createDataSupplyTask(payload) {
  const workOrder = payload?.dataSupplyTask?.providerSpec ?? payload?.labelQAWorkOrder;
  if (!workOrder) throw new Error("缺少 Label QA providerSpec");
  return {
    schemaVersion: "data-supply-task/1.0",
    taskId: "TASK-LG-WZ-001",
    demandRef: { id: "DEM-WZ-001", version: "1.0" },
    routeDecision: {
      id: "ROUTE-DATA-QA",
      type: "DATA_QA",
      reasonCode: "DATASET_REQUIRES_QA",
      approvedByRole: "data_product_owner",
      approvedAt: "2026-07-15T11:00:00+08:00",
    },
    consumer: {
      team: "PNC 算法",
      function: "work_zone_merge",
      modelVersion: "pnc-2026.07.1",
      purpose: "regression",
    },
    inputAssetRefs: [{
      id: workOrder.datasetCandidateId,
      version: workOrder.candidateLabelVersion,
      uri: "labelguard-demo://scene-0061/frames-14-16",
      snapshotDigest: workOrder.snapshotDigest,
    }],
    atomicPredicates: [{
      id: "P-SEED-QUALITY",
      definitionId: "P-SEED-QUALITY",
      category: "DATA_READINESS",
      executorId: "labelguard.quality-gate/1.0",
      requiredModalities: ["camera", "calibration", "ego_pose", "sample_annotation"],
      evidenceMaturity: "REQUIRES_QA",
      missingDataBehavior: "BLOCK_SIMULATION_SEED",
      version: "1.0",
    }],
    seedRefs: [{
      kind: "nuscenes_scene",
      uri: "nuscenes://v1.0-mini/scene-0061",
      digest: workOrder.snapshotDigest,
      licenseRef: "CC-BY-NC-SA-4.0+nuScenes-Terms",
      sampleTokens: payload?.batch?.selectedScene?.sampleTokens ?? [],
    }],
    acceptanceCriteria: [
      { id: "AC-QA-01", metric: "mandatory_blockers", operator: "eq", value: 0, unit: "issues", source: "quality-profile/1.0", approvedBy: "qa_owner" },
      { id: "AC-QA-02", metric: "review_completion", operator: "eq", value: workOrder.scope.targetIds.length, unit: "targets", source: "work-order-scope", approvedBy: "qa_owner" },
    ],
    budget: { maxTargets: workOrder.scope.targetIds.length, maxWallTimeMinutes: 30, reviewPolicy: "exhaustive_demo_batch" },
    returnRef: {
      schemaVersion: "data-supply-result/1.0",
      target: "sceneql://demands/DEM-WZ-001/results",
    },
    providerSpec: {
      ...workOrder,
      schemaVersion: WORK_ORDER_SCHEMA,
      provider: "LabelGuard",
      supplyRequestId: "TASK-LG-WZ-001",
    },
  };
}

export function preflightDataSupplyTask(task, payload) {
  const taskIssues = [];
  if (task?.schemaVersion !== "data-supply-task/1.0") taskIssues.push("UNSUPPORTED_DATA_SUPPLY_TASK_SCHEMA");
  if (!task?.taskId) taskIssues.push("MISSING_TASK_ID");
  if (task?.routeDecision?.type !== "DATA_QA") taskIssues.push("UNSUPPORTED_ROUTE_TYPE");
  if (task?.routeDecision?.id !== "ROUTE-DATA-QA") taskIssues.push("ROUTE_DECISION_ID_MISMATCH");
  if (task?.routeDecision?.reasonCode !== "DATASET_REQUIRES_QA") {
    taskIssues.push("ROUTE_REASON_CODE_MISMATCH");
  }
  if (task?.providerSpec?.schemaVersion !== WORK_ORDER_SCHEMA) taskIssues.push("UNSUPPORTED_PROVIDER_SPEC_SCHEMA");
  if (task?.providerSpec?.provider && task.providerSpec.provider !== "LabelGuard") taskIssues.push("WRONG_PROVIDER");

  const workOrder = task?.providerSpec
    ? {
        ...task.providerSpec,
        supplyRequestId: task.providerSpec.supplyRequestId ?? task.taskId,
        demandRef: task.providerSpec.demandRef ?? task.demandRef,
        snapshotDigest: task.providerSpec.snapshotDigest ?? task.inputAssetRefs?.[0]?.snapshotDigest,
        intendedUse: task.providerSpec.intendedUse ?? task.consumer?.purpose,
        licenseRef: task.providerSpec.licenseRef ?? task.seedRefs?.[0]?.licenseRef,
      }
    : null;
  if (workOrder) {
    if (workOrder.supplyRequestId !== task.taskId) taskIssues.push("TASK_ID_MISMATCH");
    if (
      workOrder.demandRef?.id !== task.demandRef?.id ||
      workOrder.demandRef?.version !== task.demandRef?.version
    ) taskIssues.push("DEMAND_REF_MISMATCH");
    if (workOrder.snapshotDigest !== task.inputAssetRefs?.[0]?.snapshotDigest) {
      taskIssues.push("INPUT_SNAPSHOT_DIGEST_MISMATCH");
    }
    if (
      workOrder.datasetCandidateId !== task.inputAssetRefs?.[0]?.id ||
      workOrder.candidateLabelVersion !== task.inputAssetRefs?.[0]?.version
    ) taskIssues.push("INPUT_ASSET_REF_MISMATCH");
    if (!task.atomicPredicates?.some((item) => item?.id === "P-SEED-QUALITY")) {
      taskIssues.push("LABEL_QA_PREDICATE_MISSING");
    }
  }
  if (taskIssues.length > 0 || !workOrder) {
    return {
      status: "NEEDS_CLARIFICATION",
      missingFields: [],
      issues: taskIssues.length > 0 ? taskIssues : ["MISSING_PROVIDER_SPEC"],
      reusableDecisions: false,
      workOrder,
    };
  }
  return { ...preflightWorkOrder(workOrder, payload), workOrder };
}

export function evaluateWorkOrder(
  payload,
  workOrder = payload?.dataSupplyTask?.providerSpec ?? payload?.labelQAWorkOrder,
) {
  const preflight = preflightWorkOrder(workOrder, payload);
  if (preflight.status !== "READY") {
    return {
      preflight,
      workOrder,
      batch: payload?.batch ?? null,
      qualityProfile: payload?.qualityProfile ?? null,
      targets: [],
      evidence: [],
      issueClusters: [],
      summary: { frameCount: payload?.frames?.length ?? 0, targetCount: 0, reviewCount: 0, autoPassCount: 0, evidenceCount: 0, blockingClusterCount: 0 },
    };
  }

  const allowedTargetIds = new Set(workOrder.scope.targetIds);
  const targets = flattenTargets(payload).filter((target) => allowedTargetIds.has(target.id));
  const byTrack = new Map();
  for (const target of targets) {
    if (!byTrack.has(target.trackId)) byTrack.set(target.trackId, []);
    byTrack.get(target.trackId).push(target);
  }
  for (const items of byTrack.values()) items.sort((a, b) => a.timestampMs - b.timestampMs);

  const evaluatedTargets = targets.map((target) => {
    const evidence = [];
    const checks = [];
    const frameSize = payload.batch.frameSize;
    const candidate2d = target.candidate2d;
    const candidate3d = target.candidate3d;
    const candidateProjection2d = target.candidateProjection2d;

    const boxInFrame = Boolean(
      candidate2d && candidate2d.width > 0 && candidate2d.height > 0 &&
      candidate2d.x >= 0 && candidate2d.y >= 0 &&
      candidate2d.x + candidate2d.width <= frameSize.width &&
      candidate2d.y + candidate2d.height <= frameSize.height,
    );
    checks.push({ rule: "BOX_IN_FRAME", passed: boxInFrame });
    if (!boxInFrame) {
      evidence.push(makeEvidence(target, "BOX_IN_FRAME", {
        detail: "候选 2D 标注超出当前传感器图像范围。",
        observed: JSON.stringify(candidate2d),
        expected: `0 ≤ x,y 且 x+w ≤ ${frameSize.width}、y+h ≤ ${frameSize.height}`,
        source: "geometry_validator",
        specClauseId: profileRule(payload, "BOX_IN_FRAME").specClauseId,
      }));
    }

    const dimensions = profileRule(payload, "CLASS_DIMENSIONS").byClass?.[target.class];
    const dimensionsValid = Boolean(
      dimensions && candidate3d &&
      between(candidate3d.length, dimensions.length) &&
      between(candidate3d.width, dimensions.width) &&
      between(candidate3d.height, dimensions.height),
    );
    checks.push({ rule: "CLASS_DIMENSIONS", passed: dimensionsValid });
    if (!dimensionsValid) {
      evidence.push(makeEvidence(target, "CLASS_DIMENSIONS", {
        detail: "候选 3D 尺寸超出当前类别 Schema 的允许范围。",
        observed: JSON.stringify(candidate3d),
        expected: `${target.class} dimension profile`,
        source: "schema_validator",
        specClauseId: profileRule(payload, "CLASS_DIMENSIONS").specClauseId,
      }));
    }

    const minProjectionIou = Number(profileRule(payload, "PROJECTION_ALIGNMENT").minIou ?? 0.55);
    const projectionIou = intersectionOverUnion(candidate2d, candidateProjection2d);
    const projectionValid = projectionIou >= minProjectionIou;
    checks.push({ rule: "PROJECTION_ALIGNMENT", passed: projectionValid, value: projectionIou });
    if (!projectionValid) {
      evidence.push(makeEvidence(target, "PROJECTION_ALIGNMENT", {
        severity: projectionIou < 0.4 ? "high" : "medium",
        detail: "候选 3D 经当前标定投影后，与候选 2D 标注重合不足；需区分标注关联与数据准备问题。",
        observed: `IoU ${projectionIou.toFixed(3)}`,
        expected: `IoU ≥ ${minProjectionIou.toFixed(3)}`,
        source: "candidate_projection_validator",
        specClauseId: profileRule(payload, "PROJECTION_ALIGNMENT").specClauseId,
      }));
    }

    const minPoints = Number(profileRule(payload, "LIDAR_POINT_SUPPORT").minimumByClass?.[target.class] ?? Number.POSITIVE_INFINITY);
    const pointsValid = Number(target.lidarPoints) >= minPoints;
    checks.push({ rule: "LIDAR_POINT_SUPPORT", passed: pointsValid, value: target.lidarPoints });
    if (!pointsValid) {
      evidence.push(makeEvidence(target, "LIDAR_POINT_SUPPORT", {
        detail: "点云支持不足只表示需要更多证据，不直接判定标签错误。",
        observed: `${target.lidarPoints} points`,
        expected: `≥ ${minPoints} points`,
        source: "lidar_counter",
        specClauseId: profileRule(payload, "LIDAR_POINT_SUPPORT").specClauseId,
      }));
    }

    const allowedModels = new Set(profileRule(payload, "MODEL_CLASS_AGREEMENT").allowedByClass?.[target.class] ?? []);
    const modelClassValid = !target.modelCandidate || allowedModels.size === 0 || allowedModels.has(target.modelCandidate.class);
    checks.push({ rule: "MODEL_CLASS_AGREEMENT", passed: modelClassValid, informational: true });
    if (!modelClassValid) {
      evidence.push(makeEvidence(target, "MODEL_CLASS_AGREEMENT", {
        detail: "Mock prediction 仅作为第二意见；该分歧默认不阻断用途资格。",
        observed: `${target.modelCandidate.class} / ${target.modelCandidate.score.toFixed(2)}`,
        expected: target.class,
        source: "mock_model_comparison",
        dataLayer: "mock_model_candidate",
        blocking: Boolean(profileRule(payload, "MODEL_CLASS_AGREEMENT").blocking),
        specClauseId: profileRule(payload, "MODEL_CLASS_AGREEMENT").specClauseId,
      }));
    }

    const track = byTrack.get(target.trackId) ?? [];
    const index = track.findIndex((item) => item.id === target.id);
    if (index > 0) {
      const previous = track[index - 1];
      const deltaSeconds = (target.timestampMs - previous.timestampMs) / 1000;
      const maxAcceleration = Number(profileRule(payload, "TRACK_ACCELERATION_CONTINUITY").maxAccelerationMps2 ?? 15);
      const acceleration = deltaSeconds > 0
        ? Math.abs(target.candidateVelocityMps - previous.candidateVelocityMps) / deltaSeconds
        : Number.POSITIVE_INFINITY;
      const temporalValid = acceleration <= maxAcceleration;
      checks.push({ rule: "TRACK_ACCELERATION_CONTINUITY", passed: temporalValid, value: acceleration });
      if (!temporalValid) {
        evidence.push(makeEvidence(target, "TRACK_ACCELERATION_CONTINUITY", {
          detail: "同一 track 的候选速度变化超过当前质量 Profile，需要复核属性、关联或时间戳。",
          observed: `${acceleration.toFixed(1)} m/s²`,
          expected: `≤ ${maxAcceleration.toFixed(1)} m/s²`,
          source: "temporal_validator",
          specClauseId: profileRule(payload, "TRACK_ACCELERATION_CONTINUITY").specClauseId,
        }));
      }
    }

    const priorityScore = evidence.reduce((max, item) => Math.max(max, SEVERITY_WEIGHT[item.severity]), 0);
    return {
      ...target,
      evidence,
      checks,
      priorityScore,
      reviewRequired: evidence.length > 0,
      qualificationBlocking: evidence.some((item) => item.blocking),
    };
  });

  const evidence = evaluatedTargets.flatMap((target) => target.evidence);
  const issueClusters = buildIssueClusters(evidence);
  return {
    preflight,
    workOrder,
    batch: payload.batch,
    qualityProfile: payload.qualityProfile,
    specClauses: payload.specClauses ?? [],
    ruleVersion: RULESET_VERSION,
    evaluatedAt: "deterministic-demo-clock",
    targets: evaluatedTargets,
    evidence,
    issueClusters,
    summary: {
      frameCount: new Set(evaluatedTargets.map((target) => target.frameId)).size,
      targetCount: evaluatedTargets.length,
      reviewCount: evaluatedTargets.filter((target) => target.reviewRequired).length,
      autoPassCount: evaluatedTargets.filter((target) => !target.reviewRequired).length,
      evidenceCount: evidence.length,
      clusterCount: issueClusters.length,
      blockingClusterCount: issueClusters.filter((cluster) => cluster.blocking).length,
      systematicClusterCount: issueClusters.filter((cluster) => cluster.systemic).length,
    },
  };
}

export const evaluateBatch = evaluateWorkOrder;

export function createReviewDecision(cluster, decision, reason, evaluation, reviewer = "Demo QA Owner") {
  const normalizedReason = String(reason ?? "").trim();
  if (!["confirmed_issue", "not_an_issue", "needs_more_evidence"].includes(decision)) {
    throw new Error("不支持的 IssueCluster 人工决策");
  }
  if (normalizedReason.length < 6) throw new Error("人工判断依据至少需要 6 个字符");
  return {
    id: `DEC-${cluster.id}`,
    clusterId: cluster.id,
    decision,
    route: decision === "confirmed_issue"
      ? cluster.recommendedRoute
      : decision === "needs_more_evidence"
        ? "NEEDS_MORE_EVIDENCE"
        : "NO_REMEDIATION",
    reason: normalizedReason,
    reviewer,
    evidenceIds: [...cluster.evidenceIds],
    specClauseIds: [...cluster.specClauseIds],
    snapshotDigest: evaluation.workOrder.snapshotDigest,
    decidedAt: "2026-07-15T09:00:00.000Z",
  };
}

export function createRemediationTask(cluster, decision, evaluation) {
  if (decision?.clusterId !== cluster.id || decision.decision !== "confirmed_issue") {
    throw new Error("仅确认的问题可生成返修任务");
  }
  return {
    schemaVersion: "labelguard.remediation-task.v1",
    id: `REM-${cluster.id}`,
    workOrderId: evaluation.workOrder.workOrderId,
    clusterId: cluster.id,
    sourceSnapshotDigest: evaluation.workOrder.snapshotDigest,
    route: cluster.recommendedRoute,
    targetIds: [...cluster.targetIds],
    evidenceIds: [...cluster.evidenceIds],
    specClauseIds: [...cluster.specClauseIds],
    status: "OPEN",
    assigneeRole: cluster.recommendedRoute === "DATA_READINESS_REPAIR" ? "data_engineer" : "annotation_vendor",
    requestedAction: cluster.recommendedRoute === "DATA_READINESS_REPAIR"
      ? "修复标定/投影数据准备链路并产出新快照"
      : "按规范条款返修同簇目标并产出新快照",
  };
}

export function createRecheckRecord(remediation, newSnapshotDigest, result = "passed", options = {}) {
  if (!remediation?.sourceSnapshotDigest) throw new Error("缺少返修任务来源快照");
  if (!/^sha256:[a-f0-9]{64}$/.test(String(newSnapshotDigest))) throw new Error("复检快照必须使用 SHA-256");
  if (newSnapshotDigest === remediation.sourceSnapshotDigest) throw new Error("快照未变化，不得复用旧决定");
  if (!["passed", "failed"].includes(result)) throw new Error("不支持的复检结果");
  return {
    id: `RCK-${remediation.clusterId}`,
    remediationId: remediation.id,
    clusterId: remediation.clusterId,
    sourceSnapshotDigest: remediation.sourceSnapshotDigest,
    checkedSnapshotDigest: newSnapshotDigest,
    result,
    recheckedEvidenceIds: [...remediation.evidenceIds],
    reviewer: options.reviewer ?? "Demo QA Owner",
    demoSyntheticRecheck: Boolean(options.demoSyntheticRecheck),
    checkedAt: "2026-07-15T09:08:00.000Z",
  };
}

export function createQualificationSignOff(
  evaluation,
  snapshotDigest,
  reviewBundleHash,
  signer = evaluation.workOrder.qaOwner,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(snapshotDigest))) {
    throw new Error("资格签署必须绑定 SHA-256 快照");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(String(reviewBundleHash))) {
    throw new Error("资格签署必须绑定复核包 SHA-256");
  }
  if (signer?.role !== "qa_owner") throw new Error("仅 QA Owner 可签署用途资格");
  return {
    id: `SIGN-${evaluation.workOrder.workOrderId}`,
    workOrderId: evaluation.workOrder.workOrderId,
    snapshotDigest,
    reviewBundleHash,
    intendedUse: evaluation.workOrder.intendedUse,
    qualityProfileRef: evaluation.workOrder.qualityProfileRef,
    signer,
    decision: "QUALIFY_FOR_INTENDED_USE",
    signedAt: "2026-07-15T09:09:00.000Z",
  };
}

function asObject(records) {
  if (records instanceof Map) return Object.fromEntries(records.entries());
  return records ?? {};
}

function validDecisionForCluster(decision, cluster, snapshotDigest) {
  if (!decision || decision.clusterId !== cluster.id || decision.snapshotDigest !== snapshotDigest) return false;
  const allowedEvidence = new Set(cluster.evidenceIds);
  const allowedClauses = new Set(cluster.specClauseIds);
  return decision.evidenceIds.every((id) => allowedEvidence.has(id)) &&
    decision.specClauseIds.every((id) => allowedClauses.has(id));
}

export function createLabelQualityManifest(
  evaluation,
  decisionInput = {},
  remediationInput = {},
  recheckInput = {},
  signOff = null,
) {
  const decisions = asObject(decisionInput);
  const remediations = asObject(remediationInput);
  const rechecks = asObject(recheckInput);
  if (evaluation.preflight.status !== "READY") {
    const core = {
      schemaVersion: QUALITY_MANIFEST_SCHEMA,
      workOrderId: evaluation.workOrder?.workOrderId ?? null,
      supplyRequestId: evaluation.workOrder?.supplyRequestId ?? null,
      intendedUse: evaluation.workOrder?.intendedUse ?? null,
      status: evaluation.preflight.status,
      qualifiedForUses: [],
      preflight: evaluation.preflight,
      generatedAt: "2026-07-15T09:10:00.000Z",
    };
    return { ...core, manifestHash: stableHash(core) };
  }

  const requiredClusters = evaluation.issueClusters.filter((cluster) => cluster.blocking);
  const unresolvedClusters = [];
  const remediationSummary = [];
  for (const cluster of requiredClusters) {
    const decision = decisions[cluster.id];
    if (!validDecisionForCluster(decision, cluster, evaluation.workOrder.snapshotDigest)) {
      unresolvedClusters.push({ clusterId: cluster.id, reason: "MISSING_OR_STALE_DECISION" });
      continue;
    }
    if (decision.decision === "needs_more_evidence") {
      unresolvedClusters.push({ clusterId: cluster.id, reason: "NEEDS_MORE_EVIDENCE" });
      continue;
    }
    if (decision.decision === "confirmed_issue") {
      const remediation = remediations[cluster.id];
      const recheck = rechecks[cluster.id];
      if (!remediation || remediation.clusterId !== cluster.id) {
        unresolvedClusters.push({ clusterId: cluster.id, reason: "REMEDIATION_NOT_CREATED" });
        continue;
      }
      if (!recheck || recheck.remediationId !== remediation.id || recheck.result !== "passed") {
        unresolvedClusters.push({ clusterId: cluster.id, reason: "RECHECK_NOT_PASSED" });
        continue;
      }
      remediationSummary.push({
        clusterId: cluster.id,
        remediationId: remediation.id,
        recheckId: recheck.id,
        checkedSnapshotDigest: recheck.checkedSnapshotDigest,
        demoSyntheticRecheck: recheck.demoSyntheticRecheck,
      });
    }
  }
  const distinctRecheckDigests = new Set(remediationSummary.map((item) => item.checkedSnapshotDigest));
  if (distinctRecheckDigests.size > 1) {
    unresolvedClusters.push({ clusterId: null, reason: "RECHECK_SNAPSHOT_DIGESTS_DIVERGE" });
  }
  const reviewedSnapshotDigest = distinctRecheckDigests.size === 1
    ? [...distinctRecheckDigests][0]
    : evaluation.workOrder.snapshotDigest;
  const acceptedDecisions = requiredClusters
    .map((cluster) => decisions[cluster.id])
    .filter((decision, index) => validDecisionForCluster(
      decision,
      requiredClusters[index],
      evaluation.workOrder.snapshotDigest,
    ));
  const reviewBundleHash = stableHash({
    workOrderId: evaluation.workOrder.workOrderId,
    sourceSnapshotDigest: evaluation.workOrder.snapshotDigest,
    reviewedSnapshotDigest,
    intendedUse: evaluation.workOrder.intendedUse,
    decisions: acceptedDecisions,
    remediationSummary,
    unresolvedClusters,
  });
  const signOffValid = Boolean(
    signOff &&
    signOff.workOrderId === evaluation.workOrder.workOrderId &&
    signOff.snapshotDigest === reviewedSnapshotDigest &&
    signOff.reviewBundleHash === reviewBundleHash &&
    signOff.intendedUse === evaluation.workOrder.intendedUse &&
    signOff.qualityProfileRef?.id === evaluation.workOrder.qualityProfileRef.id &&
    signOff.qualityProfileRef?.version === evaluation.workOrder.qualityProfileRef.version &&
    signOff.signer?.role === "qa_owner" &&
    signOff.decision === "QUALIFY_FOR_INTENDED_USE"
  );
  const signOffStatus = signOffValid ? "VALID" : signOff ? "STALE_OR_INVALID" : "MISSING";
  const status = unresolvedClusters.length > 0
    ? "BLOCKED"
    : signOffValid
      ? "QUALIFIED"
      : signOff
        ? "BLOCKED"
        : "AWAITING_SIGNOFF";
  const core = {
    schemaVersion: QUALITY_MANIFEST_SCHEMA,
    manifestVersion: "1.0.0",
    workOrderId: evaluation.workOrder.workOrderId,
    supplyRequestId: evaluation.workOrder.supplyRequestId,
    demandRef: evaluation.workOrder.demandRef,
    datasetCandidateId: evaluation.workOrder.datasetCandidateId,
    sourceSnapshotDigest: evaluation.workOrder.snapshotDigest,
    reviewedSnapshotDigest,
    reviewBundleHash,
    qualifiedSnapshotDigest: status === "QUALIFIED" ? reviewedSnapshotDigest : null,
    candidateLabelVersion: evaluation.workOrder.candidateLabelVersion,
    intendedUse: evaluation.workOrder.intendedUse,
    qualityProfile: evaluation.workOrder.qualityProfileRef,
    ruleVersion: evaluation.ruleVersion,
    status,
    qualifiedForUses: status === "QUALIFIED" ? [evaluation.workOrder.intendedUse] : [],
    assessmentScope: {
      mode: "exhaustive_public_demo",
      targetCount: evaluation.summary.targetCount,
      assessedTargetCount: evaluation.summary.targetCount,
    },
    issueSummary: {
      clusters: evaluation.summary.clusterCount,
      blockingClusters: evaluation.summary.blockingClusterCount,
      systematicClusters: evaluation.summary.systematicClusterCount,
      informationalClusters: evaluation.issueClusters.filter((cluster) => !cluster.blocking).map((cluster) => cluster.id),
      unresolvedClusters,
    },
    signOffStatus,
    decisions: acceptedDecisions,
    remediationSummary,
    limitations: [
      "Qualification is valid only for the declared intendedUse and immutable snapshot digest.",
      "nuScenes official annotations are demo-only reference evidence, not a production input requirement.",
      "Public QA perturbations and any one-click recheck are explicitly synthetic demo data.",
      "Mock model disagreement is informational under this QualityProfile.",
    ],
    licenseRef: evaluation.workOrder.licenseRef,
    signedBy: status === "QUALIFIED" ? signOff : null,
    generatedAt: "2026-07-15T09:10:00.000Z",
  };
  return { ...core, manifestHash: stableHash(core) };
}

export function createSceneQLReceipt(manifest) {
  const accepted = manifest.status === "QUALIFIED";
  const core = {
    schemaVersion: "data-supply-result/1.0",
    taskId: manifest.supplyRequestId,
    provider: "LabelGuard",
    status: accepted
      ? "ACCEPTED"
      : ["NEEDS_CLARIFICATION", "SNAPSHOT_CHANGED"].includes(manifest.status)
        ? "REWORK"
        : "PARTIAL",
    assetRef: accepted
      ? {
          id: `LQM-${manifest.datasetCandidateId}`,
          version: manifest.manifestVersion,
          manifestHash: manifest.manifestHash,
        }
      : null,
    qualityResult: {
      workOrderId: manifest.workOrderId,
      status: manifest.status,
      intendedUse: manifest.intendedUse,
      qualifiedForUses: manifest.qualifiedForUses,
      sourceSnapshotDigest: manifest.sourceSnapshotDigest ?? null,
      qualifiedSnapshotDigest: manifest.qualifiedSnapshotDigest ?? null,
    },
    limitations: manifest.limitations ?? [],
    humanDecision: {
      decision: accepted ? "ACCEPT" : "ACTION_REQUIRED",
      decidedByRole: accepted ? "qa_owner" : null,
    },
    providerResult: {
      schemaVersion: manifest.schemaVersion,
      manifestHash: manifest.manifestHash,
      qualificationStatus: manifest.status,
      qualifiedForUses: manifest.qualifiedForUses,
    },
  };
  return { ...core, receiptHash: stableHash(core) };
}
