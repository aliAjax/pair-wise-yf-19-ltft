import { ArchiveData } from "../domain/types";
import { formatDateTime } from "./format";
import { stageClassName, stageLabel } from "./stage";

/** 采集地点信息卡：按采集地点分组，读取同一份浏览器数据 */
export function LocationCards({
  data,
  onOpenDetail,
}: {
  data: ArchiveData;
  onOpenDetail: (no: string) => void;
}) {
  const groups = new Map<string, typeof data.specimens>();
  for (const s of data.specimens) {
    const key = s.location || "未登记地点";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>采集地点信息卡</p>
          <h2>按地点查看标本</h2>
        </div>
      </div>
      <div className="location-grid">
        {[...groups.entries()].map(([location, list]) => (
          <article key={location} className="location-card">
            <header>
              <h3>{location}</h3>
              <span className="count">{list.length} 份</span>
            </header>
            <ul>
              {list.map((s) => (
                <li key={s.specimenNo}>
                  <button className="linklike" onClick={() => onOpenDetail(s.specimenNo)}>
                    {s.specimenNo}
                  </button>
                  <span>{s.speciesName || "未命名"}</span>
                  <span className={stageClassName(s.dryingStage)}>{stageLabel(s.dryingStage)}</span>
                  {s.enqueuedAt && <em className="muted">{formatDateTime(s.enqueuedAt)} 入队</em>}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
