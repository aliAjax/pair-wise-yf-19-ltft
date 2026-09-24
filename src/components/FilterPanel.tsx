import { useState } from "react";
import { ArchiveData, DryingStage, IdentifyStatus, PressStatus } from "../domain/types";
import { formatDateTime } from "./format";
import { stageClassName, stageLabel } from "./stage";

type FilterKey =
  | "全部"
  | IdentifyStatus
  | DryingStage
  | PressStatus
  | "未上干燥架";

const FILTERS: FilterKey[] = [
  "全部",
  "待鉴定",
  "鉴定中",
  "已鉴定",
  "待干燥",
  "干燥中",
  "待复压",
  "已入库",
];

function matches(s: ArchiveData["specimens"][number], key: FilterKey): boolean {
  if (key === "全部") return true;
  if (key === "已入库") return s.pressStatus === "已入库";
  if (key === "未上干燥架") return s.dryingStage === "未上干燥架";
  return s.identifyStatus === key || s.dryingStage === key;
}

export function FilterPanel({
  data,
  onOpenDetail,
}: {
  data: ArchiveData;
  onOpenDetail: (no: string) => void;
}) {
  const [active, setActive] = useState<FilterKey>("全部");
  const list = data.specimens.filter((s) => matches(s, active));

  return (
    <section className="workspace">
      <aside className="panel">
        <h2>状态筛选</h2>
        <div className="chips vertical">
          {FILTERS.map((key) => (
            <button
              key={key}
              className={active === key ? "chip-active" : ""}
              onClick={() => setActive(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </aside>

      <section className="panel">
        <div className="heading">
          <div>
            <p>入库队列 / 标本总览</p>
            <h2>{active} · {list.length} 份</h2>
          </div>
        </div>
        <div className="records">
          {list.length === 0 && <p className="empty">该筛选下暂无标本。</p>}
          {list.map((s, index) => (
            <article key={s.specimenNo}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  <button className="linklike" onClick={() => onOpenDetail(s.specimenNo)}>
                    {s.specimenNo}
                  </button>
                  <span className={stageClassName(s.dryingStage)}>
                    {stageLabel(s.dryingStage)}
                  </span>
                </h3>
                <p>
                  {s.speciesName || "未命名"} · {s.location || "地点未登记"} ·{" "}
                  鉴定 {s.identifyStatus}
                  {s.cabinetSlot ? ` · 柜位 ${s.cabinetSlot}` : ""}
                </p>
                {s.enqueuedAt && (
                  <em className="muted">入队时间 {formatDateTime(s.enqueuedAt)}</em>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
