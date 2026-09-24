import { ArchiveData } from "../domain/types";
import { rotationsOf } from "../domain/rotationRules";
import { formatDateTime } from "./format";
import { stageClassName, stageLabel } from "./stage";

/** 单份标本详情页：档案字段 + 全部轮换称重记录 */
export function SpecimenDetail({
  data,
  specimenNo,
  onClose,
}: {
  data: ArchiveData;
  specimenNo: string | null;
  onClose: () => void;
}) {
  if (!specimenNo) return null;
  const specimen = data.specimens.find((s) => s.specimenNo === specimenNo);
  if (!specimen) return null;
  const history = rotationsOf(data, specimenNo);

  const fields: Array<[string, string]> = [
    ["采集号", specimen.specimenNo],
    ["物种名称", specimen.speciesName || "—"],
    ["采集地点", specimen.location || "—"],
    ["海拔", specimen.altitude || "—"],
    ["生境描述", specimen.habitat || "—"],
    ["采集人", specimen.collector || "—"],
    ["压制状态", specimen.pressStatus],
    ["鉴定状态", specimen.identifyStatus],
    ["干燥阶段", stageLabel(specimen.dryingStage)],
    ["馆藏柜位", specimen.cabinetSlot ?? "—"],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>单份标本详情</p>
            <h2>{specimen.specimenNo}</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>

        <span className={stageClassName(specimen.dryingStage)}>
          {stageLabel(specimen.dryingStage)}
        </span>
        {specimen.dryingStage === "待复压" && (
          <p className="feedback error inline">
            连续两次称重未下降，已转待复压，不能送去鉴定；请补做一次明显减重。
          </p>
        )}

        <dl className="detail-grid">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <h3 className="subhead">翻面轮换与称重记录（{history.length}）</h3>
        {history.length === 0 ? (
          <p className="empty">尚未上干燥架，暂无轮换记录。</p>
        ) : (
          <table className="rotation-table">
            <thead>
              <tr>
                <th>#</th>
                <th>翻面时间</th>
                <th>架位</th>
                <th>称重 g</th>
                <th>较上次</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={r.id} className={r.dropped ? "" : "row-stall"}>
                  <td>{i + 1}</td>
                  <td>{formatDateTime(r.turnedAt)}</td>
                  <td>{r.rackSlot}</td>
                  <td>{r.weight}</td>
                  <td>{i === 0 ? "首称" : r.dropped ? "下降" : "未下降"}</td>
                  <td>{r.remedial ? "补做" : "常规"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
