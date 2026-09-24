// 资料存档：标本档案与轮换记录的唯一数据源
// 所有页面（采集地点卡、队列、柜位记录、详情页）都通过这里读写
// 同一份浏览器数据（localStorage），重开浏览器仍可查询。

import { ArchiveData, RotationEntry, Specimen } from "./types";

const STORAGE_KEY = "hxyfront-62007-herbarium-archive-v1";

export const STORAGE_VERSION = 1;

function now(): string {
  return new Date().toISOString();
}

/** 初始演示资料：覆盖已压制待上干燥架、干燥中、已入库等状态 */
export function createSeedData(): ArchiveData {
  const t0 = "2026-09-20T08:00:00.000Z";
  const t1 = "2026-09-20T20:00:00.000Z";
  const t2 = "2026-09-21T08:00:00.000Z";

  const specimens: Specimen[] = [
    {
      specimenNo: "HX-240615-01",
      speciesName: "槭属待定",
      location: "秦岭北坡 · 海拔1420m",
      altitude: "1420m",
      habitat: "针阔混交林林缘",
      collector: "李禾",
      pressStatus: "已压制",
      identifyStatus: "待鉴定",
      dryingStage: "未上干燥架",
      createdAt: t0,
    },
    {
      specimenNo: "HX-240615-08",
      speciesName: "蕨类",
      location: "阴湿沟谷",
      altitude: "980m",
      habitat: "溪谷石缝，腐殖质丰富",
      collector: "王蕨",
      pressStatus: "已压制",
      identifyStatus: "待鉴定",
      dryingStage: "干燥中",
      createdAt: t0,
    },
    {
      specimenNo: "HX-240616-03",
      speciesName: "菊科",
      location: "高山草甸",
      altitude: "2650m",
      habitat: "开阔草甸，伴生龙胆",
      collector: "陈岩",
      pressStatus: "已入库",
      identifyStatus: "已鉴定",
      dryingStage: "已完成",
      cabinetSlot: "B-12-04",
      createdAt: "2026-09-10T03:20:00.000Z",
    },
    {
      specimenNo: "HX-240616-11",
      speciesName: "报春待定",
      location: "阴湿沟谷",
      altitude: "1010m",
      habitat: "沟谷林下湿地",
      collector: "王蕨",
      pressStatus: "已压制",
      identifyStatus: "待鉴定",
      dryingStage: "待复压",
      createdAt: t1,
    },
  ];

  const rotations: RotationEntry[] = [
    {
      id: "HX-240615-08-1",
      specimenNo: "HX-240615-08",
      rackSlot: "A-01",
      turnedAt: t1,
      weight: 42.0,
      dropped: true,
      remedial: false,
    },
    {
      id: "HX-240615-08-2",
      specimenNo: "HX-240615-08",
      rackSlot: "A-02",
      turnedAt: t2,
      weight: 38.6,
      dropped: true,
      remedial: false,
    },
    {
      id: "HX-240616-11-1",
      specimenNo: "HX-240616-11",
      rackSlot: "B-02",
      turnedAt: t1,
      weight: 55.0,
      dropped: true,
      remedial: false,
    },
    {
      id: "HX-240616-11-2",
      specimenNo: "HX-240616-11",
      rackSlot: "B-03",
      turnedAt: t2,
      weight: 55.0,
      dropped: false,
      remedial: false,
    },
  ];

  return { specimens, rotations };
}

/** 从浏览器读取存档；不存在或损坏时回退为种子资料（不落盘） */
export function loadArchive(): ArchiveData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedData();
    const parsed = JSON.parse(raw) as Partial<ArchiveData>;
    if (!Array.isArray(parsed.specimens) || !Array.isArray(parsed.rotations)) {
      return createSeedData();
    }
    return { specimens: parsed.specimens, rotations: parsed.rotations };
  } catch {
    return createSeedData();
  }
}

/** 整份资料写回浏览器（同一份数据，所有页面共享） */
export function saveArchive(data: ArchiveData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearArchive(): ArchiveData {
  const seed = createSeedData();
  saveArchive(seed);
  return seed;
}

/** 用现有采集号把已压好的标本登记进待干燥队列 */
export function enqueueSpecimen(data: ArchiveData, specimenNo: string): ArchiveData {
  const exists = data.specimens.some((item) => item.specimenNo === specimenNo);
  if (!exists) return data;
  const specimens = data.specimens.map((item) =>
    item.specimenNo === specimenNo &&
    (item.dryingStage === "未上干燥架" || item.dryingStage === "已完成")
      ? {
          ...item,
          pressStatus: "已压制" as const,
          dryingStage: "待干燥" as const,
          identifyStatus: "待鉴定" as const,
          enqueuedAt: now(),
        }
      : item
  );
  return { ...data, specimens };
}

/** 待干燥标本首次上干燥架（选定架位、登记首称） */
export function mountSpecimen(
  data: ArchiveData,
  specimenNo: string,
  rackSlot: string,
  weight: number,
  turnedAt: string
): ArchiveData {
  const entry: RotationEntry = {
    id: `${specimenNo}-${
      data.rotations.filter((r) => r.specimenNo === specimenNo).length + 1
    }`,
    specimenNo,
    rackSlot,
    turnedAt,
    weight,
    dropped: true,
    remedial: false,
  };
  return {
    specimens: data.specimens.map((item) =>
      item.specimenNo === specimenNo
        ? { ...item, dryingStage: "干燥中", enqueuedAt: item.enqueuedAt ?? turnedAt }
        : item
    ),
    rotations: [...data.rotations, entry],
  };
}

/** 干燥完成、回到待鉴定的标本送去鉴定 */
export function sendToIdentify(data: ArchiveData, specimenNo: string): ArchiveData {
  return {
    ...data,
    specimens: data.specimens.map((item) =>
      item.specimenNo === specimenNo && item.dryingStage === "已完成"
        ? { ...item, identifyStatus: "鉴定中" }
        : item
    ),
  };
}

/** 登记馆藏柜位（上柜） */
export function shelveSpecimen(
  data: ArchiveData,
  specimenNo: string,
  cabinetSlot: string
): ArchiveData {
  return {
    ...data,
    specimens: data.specimens.map((item) =>
      item.specimenNo === specimenNo
        ? {
            ...item,
            cabinetSlot,
            pressStatus: "已入库",
            identifyStatus: "已鉴定",
          }
        : item
    ),
  };
}

/** 新增标本档案（录入采集号等字段） */
export function addSpecimen(data: ArchiveData, specimen: Specimen): ArchiveData {
  if (data.specimens.some((item) => item.specimenNo === specimen.specimenNo)) {
    return data;
  }
  return { ...data, specimens: [...data.specimens, specimen] };
}

export function newSpecimenDraft(partial: Partial<Specimen>): Specimen {
  return {
    specimenNo: partial.specimenNo ?? "",
    speciesName: partial.speciesName ?? "",
    location: partial.location ?? "",
    altitude: partial.altitude ?? "",
    habitat: partial.habitat ?? "",
    collector: partial.collector ?? "",
    pressStatus: partial.pressStatus ?? "待压制",
    identifyStatus: partial.identifyStatus ?? "待鉴定",
    dryingStage: partial.dryingStage ?? "未上干燥架",
    cabinetSlot: partial.cabinetSlot,
    enqueuedAt: partial.enqueuedAt,
    createdAt: now(),
  };
}
