export const RULESET_VERSION = "labelguard-rules-v1.0.0";

const SEVERITY_WEIGHT = {
  critical: 92,
  high: 72,
  medium: 46,
  low: 18,
};

const CLASS_DIMENSIONS = {
  pedestrian: { length: [0.2, 1.2], width: [0.2, 1.2], height: [1.0, 2.4] },
  cyclist: { length: [0.8, 2.6], width: [0.3, 1.2], height: [1.0, 2.4] },
  car: { length: [2.4, 6.5], width: [1.2, 2.8], height: [1.0, 2.8] },
  traffic_cone: { length: [0.1, 0.8], width: [0.1, 0.8], height: [0.2, 1.2] },
};

const MIN_LIDAR_POINTS = {
  pedestrian: 4,
  cyclist: 4,
  car: 8,
  traffic_cone: 2,
};

const ALLOWED_MODEL_EQUIVALENTS = {
  cyclist: new Set(["cyclist"]),
  pedestrian: new Set(["pedestrian"]),
  car: new Set(["car"]),
  traffic_cone: new Set(["traffic_cone"]),
};

function between(value, range) {
  return value >= range[0] && value <= range[1];
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

function makeEvidence(target, rule, severity, category, title, detail, observed, expected, source) {
  return {
    id: "EV-" + target.id + "-" + rule,
    targetId: target.id,
    trackId: target.trackId,
    rule,
    severity,
    category,
    title,
    detail,
    observed,
    expected,
    source,
    factType: source === "model_comparison" ? "model_disagreement" : "deterministic_check",
  };
}

function routeForEvidence(evidence) {
  if (evidence.some((item) => item.severity === "critical")) return "EXPERT_REVIEW";
  if (evidence.some((item) => item.severity === "high")) return "HUMAN_REVIEW";
  if (evidence.some((item) => item.severity === "medium")) return "HUMAN_REVIEW";
  return "AUTO_PASS";
}

export function flattenTargets(payload) {
  return payload.frames.flatMap((frame, frameIndex) =>
    frame.targets.map((target) => ({
      ...target,
      frameId: frame.id,
      frameIndex,
      timestampMs: frame.timestampMs,
      image: frame.image,
      egoSpeedMps: frame.egoSpeedMps,
    })),
  );
}

export function evaluateBatch(payload) {
  if (!payload?.batch || !Array.isArray(payload.frames)) {
    throw new Error("Invalid batch payload");
  }

  const targets = flattenTargets(payload);
  const byTrack = new Map();
  for (const target of targets) {
    if (!byTrack.has(target.trackId)) byTrack.set(target.trackId, []);
    byTrack.get(target.trackId).push(target);
  }
  for (const items of byTrack.values()) {
    items.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  const evaluatedTargets = targets.map((target) => {
    const evidence = [];
    const checks = [];
    const frameSize = payload.batch.frameSize;
    const box = target.box2d;
    const boxInFrame =
      box.width > 0 &&
      box.height > 0 &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= frameSize.width &&
      box.y + box.height <= frameSize.height;
    checks.push({ rule: "BOX_IN_FRAME", passed: boxInFrame });
    if (!boxInFrame) {
      evidence.push(
        makeEvidence(
          target,
          "BOX_IN_FRAME",
          "critical",
          "geometry",
          "2D 标注越出图像边界",
          "标注框坐标超出当前传感器图像范围，需确认截断标注规范或返修。",
          JSON.stringify(box),
          "0 ≤ x,y 且 x+w ≤ 1280、y+h ≤ 720",
          "geometry_validator",
        ),
      );
    }

    const dimensions = CLASS_DIMENSIONS[target.class];
    const dimensionsValid =
      dimensions &&
      between(target.box3d.length, dimensions.length) &&
      between(target.box3d.width, dimensions.width) &&
      between(target.box3d.height, dimensions.height);
    checks.push({ rule: "CLASS_DIMENSIONS", passed: dimensionsValid });
    if (!dimensionsValid) {
      evidence.push(
        makeEvidence(
          target,
          "CLASS_DIMENSIONS",
          "high",
          "schema",
          "3D 尺寸不符合类别范围",
          "目标尺寸超出当前类别规范的允许范围。",
          JSON.stringify(target.box3d),
          target.class + " dimension profile",
          "schema_validator",
        ),
      );
    }

    const projectionIou = intersectionOverUnion(target.box2d, target.projection2d);
    const projectionValid = projectionIou >= 0.55;
    checks.push({ rule: "PROJECTION_ALIGNMENT", passed: projectionValid, value: projectionIou });
    if (!projectionValid) {
      evidence.push(
        makeEvidence(
          target,
          "PROJECTION_ALIGNMENT",
          projectionIou < 0.4 ? "high" : "medium",
          "projection",
          "3D 投影与 2D 标注关联偏差",
          "标定投影框与人工 2D 框重合不足，需复核目标关联或标定引用。",
          "IoU " + projectionIou.toFixed(3),
          "IoU ≥ 0.550",
          "projection_validator",
        ),
      );
    }

    const minPoints = MIN_LIDAR_POINTS[target.class] ?? 1;
    const pointsValid = target.lidarPoints >= minPoints;
    checks.push({ rule: "LIDAR_POINT_SUPPORT", passed: pointsValid, value: target.lidarPoints });
    if (!pointsValid) {
      evidence.push(
        makeEvidence(
          target,
          "LIDAR_POINT_SUPPORT",
          "medium",
          "sensor_support",
          "LiDAR 点支持不足",
          "该目标的点云支持低于当前类别质检门槛；这是风险信号，不代表标签一定错误。",
          String(target.lidarPoints) + " points",
          "≥ " + minPoints + " points",
          "lidar_counter",
        ),
      );
    }

    const allowedModels = ALLOWED_MODEL_EQUIVALENTS[target.class] ?? new Set([target.class]);
    const modelClassValid = !target.modelCandidate || allowedModels.has(target.modelCandidate.class);
    checks.push({ rule: "MODEL_CLASS_AGREEMENT", passed: modelClassValid });
    if (!modelClassValid) {
      evidence.push(
        makeEvidence(
          target,
          "MODEL_CLASS_AGREEMENT",
          "medium",
          "model_disagreement",
          "模型候选与标签类别不一致",
          "模型输出只能作为第二意见；需要人工根据多传感器证据裁决。",
          target.modelCandidate.class + " / " + target.modelCandidate.score.toFixed(2),
          target.class,
          "model_comparison",
        ),
      );
    }

    if (!target.modelCandidate) {
      evidence.push(
        makeEvidence(
          target,
          "MODEL_CANDIDATE_MISSING",
          "low",
          "model_disagreement",
          "模型未给出候选目标",
          "缺失 prediction 仅表示模型与标签不一致，不能用于否定目标存在。",
          "no candidate",
          "second opinion only",
          "model_comparison",
        ),
      );
    }

    const track = byTrack.get(target.trackId) ?? [];
    const index = track.findIndex((item) => item.id === target.id);
    if (index > 0) {
      const previous = track[index - 1];
      const deltaSeconds = (target.timestampMs - previous.timestampMs) / 1000;
      const acceleration = deltaSeconds > 0
        ? Math.abs(target.velocityMps - previous.velocityMps) / deltaSeconds
        : Number.POSITIVE_INFINITY;
      const temporalValid = acceleration <= 15;
      checks.push({ rule: "TRACK_ACCELERATION_CONTINUITY", passed: temporalValid, value: acceleration });
      if (!temporalValid) {
        evidence.push(
          makeEvidence(
            target,
            "TRACK_ACCELERATION_CONTINUITY",
            "high",
            "temporal",
            "跨帧速度连续性异常",
            "同一 track 在相邻帧的速度变化超过质检上限，需确认速度属性、track 关联或时间戳。",
            acceleration.toFixed(1) + " m/s²",
            "≤ 15.0 m/s²",
            "temporal_validator",
          ),
        );
      }
    }

    const maxWeight = evidence.reduce(
      (max, item) => Math.max(max, SEVERITY_WEIGHT[item.severity]),
      0,
    );
    const riskScore = Math.min(100, maxWeight + Math.max(0, evidence.length - 1) * 3);
    const route = routeForEvidence(evidence);

    return {
      ...target,
      evidence,
      checks,
      riskScore,
      route,
      reviewRequired: route !== "AUTO_PASS",
    };
  });

  const evidence = evaluatedTargets.flatMap((target) => target.evidence);
  return {
    batch: payload.batch,
    ruleVersion: RULESET_VERSION,
    evaluatedAt: "deterministic",
    targets: evaluatedTargets,
    evidence,
    summary: {
      frameCount: payload.frames.length,
      targetCount: evaluatedTargets.length,
      reviewCount: evaluatedTargets.filter((target) => target.reviewRequired).length,
      autoPassCount: evaluatedTargets.filter((target) => !target.reviewRequired).length,
      criticalCount: evidence.filter((item) => item.severity === "critical").length,
      highCount: evidence.filter((item) => item.severity === "high").length,
      evidenceCount: evidence.length,
    },
  };
}

export function decisionRoute(decision) {
  if (decision === "pass") return "RELEASE_CANDIDATE";
  if (decision === "reject") return "EXPERT_REVIEW";
  if (decision === "repair") return "ANNOTATION_REWORK";
  throw new Error("不支持的人工决策类型");
}

export function createDecision(target, decision, reason, reviewer = "Demo QA Reviewer") {
  const normalizedReason = String(reason ?? "").trim();
  if (!["pass", "reject", "repair"].includes(decision)) {
    throw new Error("人工决策必须是通过、驳回或返修");
  }
  if (normalizedReason.length < 4) {
    throw new Error("人工判断依据至少需要 4 个字符");
  }
  return {
    id: "DEC-" + target.id,
    targetId: target.id,
    trackId: target.trackId,
    frameId: target.frameId,
    decision,
    route: decisionRoute(decision),
    reason: normalizedReason,
    reviewer,
    evidenceIds: target.evidence.map((item) => item.id),
    decidedAt: "2026-07-15T09:00:00.000Z",
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableHash(value) {
  const input = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "lg-" + (hash >>> 0).toString(16).padStart(8, "0");
}

export function createReleaseManifest(evaluation, decisionsInput = {}) {
  const decisions = decisionsInput instanceof Map
    ? Object.fromEntries(decisionsInput.entries())
    : decisionsInput;
  const required = evaluation.targets.filter((target) => target.reviewRequired);
  const unresolved = required
    .filter((target) => !decisions[target.id])
    .map((target) => target.id);
  const resolvedDecisions = required
    .map((target) => decisions[target.id])
    .filter(Boolean)
    .sort((a, b) => a.targetId.localeCompare(b.targetId));
  const blockers = resolvedDecisions
    .filter((item) => item.decision !== "pass")
    .map((item) => ({
      targetId: item.targetId,
      decision: item.decision,
      route: item.route,
      reason: item.reason,
    }));
  const status = unresolved.length === 0 && blockers.length === 0 ? "READY" : "BLOCKED";

  const core = {
    schemaVersion: "labelguard.release.v1",
    batchId: evaluation.batch.id,
    sourceDigest: evaluation.batch.contentDigest,
    source: {
      name: evaluation.batch.source,
      dataNature: evaluation.batch.dataNature,
      license: evaluation.batch.license,
      publicRelease: Boolean(evaluation.batch.publicRelease),
    },
    baseLabelVersion: evaluation.batch.baseLabelVersion,
    candidateLabelVersion: evaluation.batch.candidateLabelVersion,
    ruleVersion: evaluation.ruleVersion,
    status,
    unresolved,
    blockers,
    decisions: resolvedDecisions,
    autoPassedTargetIds: evaluation.targets
      .filter((target) => !target.reviewRequired)
      .map((target) => target.id)
      .sort(),
    counts: {
      targets: evaluation.summary.targetCount,
      autoPassed: evaluation.summary.autoPassCount,
      humanPassed: resolvedDecisions.filter((item) => item.decision === "pass").length,
      rejected: resolvedDecisions.filter((item) => item.decision === "reject").length,
      repairRequired: resolvedDecisions.filter((item) => item.decision === "repair").length,
      unresolved: unresolved.length,
    },
    generatedAt: "2026-07-15T09:10:00.000Z",
  };

  return {
    ...core,
    manifestHash: stableHash(core),
  };
}
