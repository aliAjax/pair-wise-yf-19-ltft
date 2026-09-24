// 干燥轮换判断：纯业务规则，不接触 React 与 localStorage
//
// 规则（来自标本馆轮换工作台要求）：
// 1. 相邻两次轮换不能停在同一架位；
// 2. 重量连续两次没有下降（本次 ≥ 上次）就转待复压，不能送去鉴定；
// 3. 目标架位已被其他标本占用，或本次称重高于上次，本次操作不保存，
//    原架位、轮换记录和标本状态维持原样；
// 4. 待复压标本补做一次“明显减重”后回到待鉴定。

import {
  ACTIVE_STAGES,
  ArchiveData,
  DryingStage,
  RotationEntry,
  SIGNIFICANT_DROP_GRAMS,
  Specimen,
  WEIGHT_EPSILON,
} from "./types";

export interface RotationInput {
  specimenNo: string;
  rackSlot: string;
  turnedAt: string;
  weight: number;
  remedial: boolean;
}

export type RotationRejectReason =
  | "SPECIMEN_NOT_FOUND"
  | "NOT_IN_DRYING"
  | "SAME_SLOT"
  | "SLOT_OCCUPIED"
  | "WEIGHT_NOT_DROPPED";

export type RotationOutcome =
  | { ok: true; data: ArchiveData; stage: DryingStage; dropped: boolean }
  | { ok: false; reason: RotationRejectReason; message: string };

/** 某标本已保存的轮换记录，按时间先后排序 */
export function rotationsOf(data: ArchiveData, specimenNo: string): RotationEntry[] {
  return data.rotations
    .filter((entry) => entry.specimenNo === specimenNo)
    .sort((a, b) => a.turnedAt.localeCompare(b.turnedAt));
}

/** 标本当前架位（最近一次有效记录的架位） */
export function currentSlotOf(data: ArchiveData, specimenNo: string): string | undefined {
  const list = rotationsOf(data, specimenNo);
  return list.length ? list[list.length - 1].rackSlot : undefined;
}

/** 每份在架标本当前占用的架位 -> 采集号 */
export function occupiedSlots(data: ArchiveData): Map<string, string> {
  const map = new Map<string, string>();
  for (const specimen of data.specimens) {
    if (ACTIVE_STAGES.includes(specimen.dryingStage)) {
      const slot = currentSlotOf(data, specimen.specimenNo);
      if (slot) map.set(slot, specimen.specimenNo);
    }
  }
  return map;
}

function buildEntry(
  input: RotationInput,
  dropped: boolean,
  sequence: number
): RotationEntry {
  return {
    id: `${input.specimenNo}-${sequence + 1}`,
    specimenNo: input.specimenNo,
    rackSlot: input.rackSlot,
    turnedAt: input.turnedAt,
    weight: input.weight,
    dropped,
    remedial: input.remedial,
  };
}

/**
 * 判定并落盘一次翻面轮换。
 * 任一前置条件不满足都直接拒绝，返回不可变的拒绝结果，
 * 不修改传入的 data（调用方据此维持原样）。
 */
export function applyRotation(data: ArchiveData, input: RotationInput): RotationOutcome {
  const specimen = data.specimens.find((item) => item.specimenNo === input.specimenNo);
  if (!specimen) {
    return {
      ok: false,
      reason: "SPECIMEN_NOT_FOUND",
      message: `找不到采集号 ${input.specimenNo} 的标本`,
    };
  }

  if (!ACTIVE_STAGES.includes(specimen.dryingStage)) {
    return {
      ok: false,
      reason: "NOT_IN_DRYING",
      message: "该标本当前不在干燥架上，不能登记翻面",
    };
  }

  const history = rotationsOf(data, specimen.specimenNo);
  const previous = history.length ? history[history.length - 1] : undefined;

  // 规则 1：相邻两次不能停在同一架位
  if (previous && previous.rackSlot === input.rackSlot) {
    return {
      ok: false,
      reason: "SAME_SLOT",
      message: `相邻两次不能停在同一架位（${input.rackSlot}），请换一个架位`,
    };
  }

  // 规则 3：目标架位已被其他在架标本占用
  const occupant = occupiedSlots(data).get(input.rackSlot);
  if (occupant && occupant !== input.specimenNo) {
    return {
      ok: false,
      reason: "SLOT_OCCUPIED",
      message: `架位 ${input.rackSlot} 已被 ${occupant} 占用`,
    };
  }

  // 严格下降才算减重；持平属于“没有下降”但记录仍保存，
  // 只有“高于上次”才按规则拒绝保存。
  const dropped = previous ? input.weight < previous.weight - WEIGHT_EPSILON : true;

  // 规则 3：称重高于上次 -> 本次不保存
  if (previous && input.weight > previous.weight + WEIGHT_EPSILON) {
    return {
      ok: false,
      reason: "WEIGHT_NOT_DROPPED",
      message: `本次称重 ${input.weight}g 高于上次 ${previous.weight}g，本次登记不保存`,
    };
  }

  const entry = buildEntry(input, dropped, history.length);

  // 规则 2：连续两次没有下降（本次与上次均未下降）-> 转待复压，
  // 待复压标本不能送去鉴定。
  // 规则 4：待复压后补做一次“明显减重”-> 完成干燥、回到待鉴定。
  let nextStage: DryingStage = specimen.dryingStage;
  if (input.remedial) {
    if (
      previous &&
      previous.weight - input.weight >= SIGNIFICANT_DROP_GRAMS - WEIGHT_EPSILON
    ) {
      nextStage = "已完成";
    }
    // 补做但减重不明显（含持平/轻微下降）：维持待复压，等待再补做。
  } else if (specimen.dryingStage === "待复压") {
    // 已在待复压流程中，普通翻面不改变状态，需走“补做”通道。
    nextStage = "待复压";
  } else if (previous && previous.dropped === false && !dropped) {
    nextStage = "待复压";
  } else {
    nextStage = "干燥中";
  }

  const nextSpecimen: Specimen = { ...specimen, dryingStage: nextStage };
  const nextData: ArchiveData = {
    specimens: data.specimens.map((item) =>
      item.specimenNo === specimen.specimenNo ? nextSpecimen : item
    ),
    rotations: [...data.rotations, entry],
  };

  return { ok: true, data: nextData, stage: nextStage, dropped };
}

/** 标本完成干燥（待复压补做成功）后，鉴定状态是否可送去鉴定 */
export function canSendToIdentify(specimen: Specimen): boolean {
  return specimen.dryingStage === "已完成";
}
