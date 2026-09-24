// 资料存档：浏览器 localStorage 持久层。
// 采集地点卡、待干燥队列、柜位记录和详情页都读取这里的同一份数据，
// 重开浏览器后仍可查询。

import type {
  ArchiveData,
  CabinetRecord,
  LocationCard,
  RotationLog,
  Specimen,
} from "./types";

const STORAGE_KEY = "herbarium.archive.v1";

/** 首次使用时的种子数据（包含原项目里的示例采集号） */
function seed(): ArchiveData {
  const now = new Date().toISOString();
  return {
    locations: [
      {
        name: "阴湿沟谷",
        region: "海拔1420m 沟谷林下",
        elevation: "1420m",
        habitat: "溪旁腐殖土，乔灌郁闭",
        note: "蕨类与槭属标本均采于此",
      },
      {
        name: "东坡灌丛",
        region: "海拔1180m 阳坡",
        elevation: "1180m",
        habitat: "林缘灌丛，排水良好",
      },
    ],
    specimens: {
      "HX-240615-01": {
        collectingNo: "HX-240615-01",
        species: "槭属待定",
        locationName: "阴湿沟谷",
        elevation: "1420m",
        habitat: "溪旁腐殖土",
        collector: "采集组甲",
        status: "待干燥",
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      "HX-240615-08": {
        collectingNo: "HX-240615-08",
        species: "蕨类",
        locationName: "阴湿沟谷",
        elevation: "1420m",
        habitat: "阴湿沟谷石缝",
        collector: "采集组甲",
        status: "待干燥",
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      "HX-240616-03": {
        collectingNo: "HX-240616-03",
        species: "菊科",
        locationName: "东坡灌丛",
        elevation: "1180m",
        habitat: "林缘灌丛",
        collector: "采集组乙",
        status: "已入库",
        cabinetPosition: "B-12-04",
        createdAt: now,
        updatedAt: now,
      },
    },
    rotations: [],
    cabinets: [
      {
        collectingNo: "HX-240616-03",
        species: "菊科",
        cabinetPosition: "B-12-04",
        storedAt: now,
      },
    ],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 读取整份存档；不存在时用种子数据初始化并写回 */
export function loadArchive(): ArchiveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return clone(initial);
    }
    const parsed = JSON.parse(raw) as Partial<ArchiveData>;
    return {
      specimens: parsed.specimens ?? {},
      rotations: parsed.rotations ?? [],
      locations: parsed.locations ?? [],
      cabinets: parsed.cabinets ?? [],
    };
  } catch {
    return seed();
  }
}

/** 整份存档写回（轮换判定通过后一次性提交，失败不产生半份数据） */
export function saveArchive(data: ArchiveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function listSpecimens(data: ArchiveData): Specimen[] {
  return Object.values(data.specimens).sort((a, b) =>
    a.collectingNo.localeCompare(b.collectingNo, "zh-Hans-CN")
  );
}

export function getSpecimen(
  data: ArchiveData,
  collectingNo: string
): Specimen | undefined {
  return data.specimens[collectingNo];
}

/** 某份标本的轮换历史，按时间正序 */
export function rotationsOf(
  data: ArchiveData,
  collectingNo: string
): RotationLog[] {
  return data.rotations
    .filter((log) => log.collectingNo === collectingNo)
    .sort((a, b) => a.flippedAt.localeCompare(b.flippedAt));
}

/** 待干燥队列：已登记待干燥 或 已在架上干燥中、待复压的标本 */
export function dryingQueue(data: ArchiveData): Specimen[] {
  return listSpecimens(data).filter((s) =>
    ["待干燥", "干燥中", "待复压"].includes(s.status)
  );
}

/** 当前被占用的架位：干燥中/待复压标本各自最后一次轮换的架位 */
export function occupiedRacks(
  data: ArchiveData,
  excludeCollectingNo?: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const specimen of Object.values(data.specimens)) {
    if (
      specimen.collectingNo === excludeCollectingNo ||
      !["干燥中", "待复压"].includes(specimen.status)
    ) {
      continue;
    }
    const history = rotationsOf(data, specimen.collectingNo);
    const last = history[history.length - 1];
    if (last) map.set(last.rackPosition, specimen.collectingNo);
  }
  return map;
}

export function findLocation(
  data: ArchiveData,
  name: string
): LocationCard | undefined {
  return data.locations.find((loc) => loc.name === name);
}

export function upsertSpecimen(data: ArchiveData, specimen: Specimen): void {
  data.specimens[specimen.collectingNo] = specimen;
}

export function appendRotation(data: ArchiveData, log: RotationLog): void {
  data.rotations.push(log);
}

export function appendCabinet(data: ArchiveData, record: CabinetRecord): void {
  data.cabinets.push(record);
}

/** 清空并恢复为种子数据（演示用） */
export function resetArchive(): ArchiveData {
  const initial = seed();
  saveArchive(initial);
  return clone(initial);
}
