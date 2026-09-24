// 轮换判断：干燥架轮换的纯业务规则（不碰 DOM 与 localStorage）。
//
// 规则：
// 1. 已压好的标本凭现有采集号进入待干燥队列。
// 2. 每次轮换登记架位、翻面时间、称重；相邻两次不能停在同一架位。
// 3. 重量连续两次没有下降（持平也算）→ 转「待复压」，不能送去鉴定。
// 4. 目标架位已被别人占用，或本次称重重于上次 → 本次操作不保存，
//    原架位、轮换记录、标本状态全部维持原样。
// 5. 待复压后补做一次「明显减重」的轮换 → 回到「待鉴定」。

import {
  appendCabinet,
  appendRotation,
  occupiedRacks,
  rotationsOf,
  upsertSpecimen,
} from "./archive";
import type {
  ArchiveData,
  RotationInput,
  RotationLog,
  RotationOutcome,
  Specimen,
} from "./types";

/** 明显减重：相对上次减重比例达到 3%，或绝对减重达到 0.5 克 */
export const SIGNIFICANT_LOSS_RATIO = 0.03;
export const SIGNIFICANT_LOSS_GRAMS = 0.5;

/** 连续未下降次数达到该值即转待复压 */
const STALL_LIMIT = 2;

function cloneArchive(data: ArchiveData): ArchiveData {
  return JSON.parse(JSON.stringify(data)) as ArchiveData;
}

function makeLogId(): string {
  return `rot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 现有标本进入待干燥队列：仅「待压制」可入队，已在队列中的不重复登记 */
export function enqueueForDrying(
  data: ArchiveData,
  collectingNo: string,
  nowIso: string
): { ok: boolean; reason?: string; specimen?: Specimen } {
  const specimen = data.specimens[collectingNo];
  if (!specimen) {
    return { ok: false, reason: "采集号不存在，请使用现有标本的采集号" };
  }
  if (specimen.status !== "待压制") {
    return {
      ok: false,
      reason: `当前状态为「${specimen.status}」，只有待压制的标本能进入待干燥队列`,
    };
  }
  const next: Specimen = {
    ...specimen,
    status: "待干燥",
    queuedAt: nowIso,
    updatedAt: nowIso,
  };
  upsertSpecimen(data, next);
  return { ok: true, specimen: next };
}

function isSignificantLoss(prevWeight: number, weight: number): boolean {
  const lost = prevWeight - weight;
  return (
    lost >= SIGNIFICANT_LOSS_GRAMS ||
    lost / prevWeight >= SIGNIFICANT_LOSS_RATIO
  );
}

export type SubmitResult =
  | (RotationOutcome & { ok: true; data: ArchiveData })
  | (RotationOutcome & { ok: false; data?: undefined });

/**
 * 提交一次上/换架轮换。
 * 失败时返回 { ok: false }，入参 data 不会被修改，调用方不得写存档；
 * 成功时在入参数据的副本上追加记录并调整状态，随结果返回。
 */
export function submitRotation(
  source: ArchiveData,
  input: RotationInput
): SubmitResult {
  const data = cloneArchive(source);
  const specimen = data.specimens[input.collectingNo];

  if (!specimen) {
    return { ok: false, reason: "采集号不存在" };
  }
  if (!["待干燥", "干燥中", "待复压"].includes(specimen.status)) {
    return {
      ok: false,
      reason: `「${specimen.status}」状态的标本不需要上干燥架`,
    };
  }
  const rack = input.rackPosition.trim();
  if (!rack) {
    return { ok: false, reason: "请填写架位" };
  }
  if (!(input.weight > 0)) {
    return { ok: false, reason: "请填写有效的称重（克）" };
  }
  if (!input.flippedAt) {
    return { ok: false, reason: "请填写翻面时间" };
  }

  const history = rotationsOf(data, input.collectingNo);
  const last = history[history.length - 1];

  // 规则 2：相邻两次不能停在同一架位
  if (last && last.rackPosition === rack) {
    return {
      ok: false,
      reason: `相邻两次不能停在同一架位（${rack}），请换到其它架位`,
    };
  }

  // 规则 4a：目标架位已被其他在架标本占用 → 不保存
  const racks = occupiedRacks(data, input.collectingNo);
  const holder = racks.get(rack);
  if (holder) {
    return {
      ok: false,
      reason: `架位 ${rack} 已被 ${holder} 占用，本次轮换不保存`,
    };
  }

  // 规则 4b：本次称重高于上次 → 不保存
  if (last && input.weight > last.weight) {
    return {
      ok: false,
      reason: `本次称重 ${input.weight}g 高于上次 ${last.weight}g，本次轮换不保存`,
    };
  }

  const delta = last ? input.weight - last.weight : null;
  const stalled = delta !== null && delta >= 0;

  // 统计包含本次在内、末尾连续未下降的次数
  let streak = stalled ? 1 : 0;
  if (stalled) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].stalled) streak += 1;
      else break;
    }
  }

  let nextStatus: Specimen["status"];
  if (specimen.status === "待复压") {
    // 规则 5：复压后补做一次明显减重 → 待鉴定；否则继续待复压
    nextStatus =
      last && isSignificantLoss(last.weight, input.weight)
        ? "待鉴定"
        : "待复压";
  } else if (stalled && streak >= STALL_LIMIT) {
    // 规则 3：连续两次没有下降 → 待复压，不能送鉴定
    nextStatus = "待复压";
  } else {
    nextStatus = "干燥中";
  }

  const log: RotationLog = {
    id: makeLogId(),
    collectingNo: input.collectingNo,
    rackPosition: rack,
    flippedAt: input.flippedAt,
    weight: input.weight,
    delta,
    stalled,
  };

  const updated: Specimen = {
    ...specimen,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  upsertSpecimen(data, updated);
  appendRotation(data, log);

  return { ok: true, data, specimen: updated, log };
}

/** 鉴定通过后上柜：记录柜位并转为已入库 */
export function storeInCabinet(
  source: ArchiveData,
  collectingNo: string,
  cabinetPosition: string,
  nowIso: string
): { ok: boolean; reason?: string; data?: ArchiveData } {
  const data = cloneArchive(source);
  const specimen = data.specimens[collectingNo];
  if (!specimen) return { ok: false, reason: "采集号不存在" };
  if (specimen.status !== "待鉴定") {
    return { ok: false, reason: "只有「待鉴定」状态的标本可以鉴定上柜" };
  }
  const position = cabinetPosition.trim();
  if (!position) return { ok: false, reason: "请填写柜位" };

  const updated: Specimen = {
    ...specimen,
    status: "已入库",
    cabinetPosition: position,
    updatedAt: nowIso,
  };
  upsertSpecimen(data, updated);
  appendCabinet(data, {
    collectingNo,
    species: specimen.species,
    cabinetPosition: position,
    storedAt: nowIso,
  });
  return { ok: true, data };
}
