// 共享业务类型：标本档案、干燥轮换记录与判定结果

/** 压制/流转状态 */
export type SpecimenStatus =
  | "待压制"
  | "待干燥" // 已压好，等待上干燥架
  | "干燥中" // 已在干燥架上轮换
  | "待复压" // 连续两次称重未下降
  | "待鉴定" // 干燥达标，可送去鉴定
  | "已入库"; // 已上柜

export interface Specimen {
  /** 采集号，主键 */
  collectingNo: string;
  species: string;
  /** 采集地点名称，对应地点卡 */
  locationName: string;
  elevation?: string;
  habitat?: string;
  collector?: string;
  status: SpecimenStatus;
  /** 馆藏柜位，已入库时填写 */
  cabinetPosition?: string;
  /** 进入待干燥队列的时间 */
  queuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationCard {
  name: string;
  region: string;
  elevation: string;
  habitat: string;
  note?: string;
}

/** 一次上/换架轮换记录 */
export interface RotationLog {
  id: string;
  collectingNo: string;
  /** 本次所在架位，如 A-03 */
  rackPosition: string;
  /** 翻面时间 ISO 字符串 */
  flippedAt: string;
  /** 本次称重（克） */
  weight: number;
  /** 相比上一次的重量变化（克），首次为 null */
  delta: number | null;
  /** 本次轮换后是否连续两次未下降（用于触发待复压） */
  stalled: boolean;
}

export interface CabinetRecord {
  collectingNo: string;
  species: string;
  /** 柜位号，如 B-12-04 */
  cabinetPosition: string;
  storedAt: string;
}

/** 整份浏览器存档数据，所有页面共用同一份 */
export interface ArchiveData {
  specimens: Record<string, Specimen>;
  rotations: RotationLog[];
  locations: LocationCard[];
  cabinets: CabinetRecord[];
}

/** 一次轮换提交的入参 */
export interface RotationInput {
  collectingNo: string;
  rackPosition: string;
  flippedAt: string;
  weight: number;
}

/** 判定结论 */
export type RotationOutcome =
  | { ok: true; specimen: Specimen; log: RotationLog }
  | { ok: false; reason: string };
