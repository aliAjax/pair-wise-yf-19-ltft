import { useState } from "react";
import { ArchiveData } from "../domain/types";
import { sendToIdentify, shelveSpecimen } from "../domain/archive";
import { formatDateTime } from "./format";

interface Props {
  data: ArchiveData;
  setData: (next: ArchiveData) => void;
  onOpenDetail: (no: string) => void;
}

/** 馆藏柜位记录 + 干燥完成后的鉴定/上柜操作（待复压标本不能送去鉴定） */
export function CabinetRecords({ data, setData, onOpenDetail }: Props) {
  const shelved = data.specimens.filter((s) => s.cabinetSlot);
  const ready = data.specimens.filter((s) => s.dryingStage === "已完成");
  const rePress = data.specimens.filter((s) => s.dryingStage === "待复压");

  const [targetNo, setTargetNo] = useState(ready[0]?.specimenNo ?? "");
  const [cabinet, setCabinet] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const activeNo = ready.some((s) => s.specimenNo === targetNo)
    ? targetNo
    : ready[0]?.specimenNo ?? "";

  const identify = () => {
    if (!activeNo) return;
    setData(sendToIdentify(data, activeNo));
    setMessage({ type: "ok", text: `${activeNo} 已送去鉴定` });
  };

  const shelve = () => {
    const slot = cabinet.trim();
    if (!activeNo) return;
    if (!slot) {
      setMessage({ type: "error", text: "请填写馆藏柜位，如 B-12-04" });
      return;
    }
    if (
      data.specimens.some(
        (s) => s.cabinetSlot === slot && s.specimenNo !== activeNo
      )
    ) {
      setMessage({ type: "error", text: `柜位 ${slot} 已有其他标本` });
      return;
    }
    setData(shelveSpecimen(data, activeNo, slot));
    setMessage({ type: "ok", text: `${activeNo} 已上柜 ${slot}` });
    setCabinet("");
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>馆藏柜位记录</p>
          <h2>鉴定与上柜</h2>
        </div>
      </div>

      {rePress.length > 0 && (
        <p className="feedback error inline">
          待复压 {rePress.map((s) => s.specimenNo).join("、")}：重量未达标，不能送去鉴定，
          需在轮换工作台补做一次明显减重。
        </p>
      )}

      {ready.length > 0 ? (
        <div className="shelve-box">
          <label>
            <span>干燥完成标本</span>
            <select value={activeNo} onChange={(e) => setTargetNo(e.target.value)}>
              {ready.map((s) => (
                <option key={s.specimenNo} value={s.specimenNo}>
                  {s.specimenNo}（{s.speciesName || "未命名"}）
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>馆藏柜位</span>
            <input
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
              placeholder="如 B-12-04"
            />
          </label>
          <div className="form-actions">
            <button onClick={identify}>送去鉴定</button>
            <button className="primary" onClick={shelve}>
              登记上柜
            </button>
          </div>
        </div>
      ) : (
        <p className="empty">暂无干燥完成、回到待鉴定的标本。</p>
      )}

      {message && (
        <p className={message.type === "ok" ? "feedback ok" : "feedback error"}>{message.text}</p>
      )}

      <h3 className="subhead">柜位台账（{shelved.length}）</h3>
      {shelved.length === 0 ? (
        <p className="empty">还没有上柜记录。</p>
      ) : (
        <div className="records">
          {shelved.map((s, index) => (
            <article key={s.specimenNo}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  <button className="linklike" onClick={() => onOpenDetail(s.specimenNo)}>
                    {s.specimenNo}
                  </button>
                </h3>
                <p>
                  {s.speciesName || "未命名"} · 柜位 {s.cabinetSlot} · {s.location} ·{" "}
                  {s.collector || "采集人未登记"}
                </p>
                <em className="muted">建档 {formatDateTime(s.createdAt)}</em>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
