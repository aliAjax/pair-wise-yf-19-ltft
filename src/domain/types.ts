// 植物标本馆干燥轮换领域：共享类型与常量

/** 压制状态 */
export type PressStatus = "待压制" | "已压制" | "待复压" | "已入库";

/** 鉴定状态 */
export type IdentifyStatus = "待鉴定" | "鉴定中" | "已鉴定";

/**
 * 干燥阶段（标本进入干燥流水线后的生命周期）
 * 未上干燥架 -> 待干燥（队列）-> 干燥中 -> 已完成（回到待鉴定）
 * 干燥中任一时点可转入 待复压，补做明显减重后再 已完成
 */
export type DryingStage =
  | "未上干燥架"
  | "待干燥"
  | "干燥中"
  | "待复压"
  | "已完成";

/** 一次翻面轮换登记（成功保存后才会产生记录） */
export interface RotationEntry {
  id: string;
  /** 采集号 */
  specimenNo: string;
  /** 本次架位，如 A-01 */
  rackSlot: string;
  /** 翻面时间（ISO 字符串） */
  turnedAt: string;
  /** 本次称重，单位 g */
  weight: number;
  /** 相对上一次有效称重是否下降；首次称重记为 true */
  dropped: boolean;
  /** 是否为待复压后的补做记录 */
  remedial: boolean;
}

/** 单份标本档案 */
export interface Specimen {
  /** 采集号（业务主键） */
  specimenNo: string;
  speciesName: string;
  /** 采集地点 */
  location: string;
  altitude: string;
  habitat: string;
  collector: string;
  pressStatus: PressStatus;
  identifyStatus: IdentifyStatus;
  dryingStage: DryingStage;
  /** 馆藏柜位，如 B-12-04 */
  cabinetSlot?: string;
  /** 进入待干燥队列的时间 */
  enqueuedAt?: string;
  createdAt: string;
}

/** 浏览器中持久保存的整份资料 */
export interface ArchiveData {
  specimens: Specimen[];
  rotations: RotationEntry[];
}

/** 干燥架固定架位 */
export const RACK_SLOTS = [
  "A-01",
  "A-02",
  "A-03",
  "B-01",
  "B-02",
  "B-03",
  "C-01",
  "C-02",
] as const;

/** 仍占用干燥架架位的阶段（有待存称重记录、架位尚未释放） */
export const ACTIVE_STAGES: ReadonlyArray<DryingStage> = ["干燥中", "待复压"];

/**
 * 补做轮换时认定“明显减重”的阈值：本次称重要比上次低至少该克数，
 * 才算补做成功、回到待鉴定。
 */
export const SIGNIFICANT_DROP_GRAMS = 0.5;

/** 称重比较的浮点容差 */
export const WEIGHT_EPSILON = 1e-6;
