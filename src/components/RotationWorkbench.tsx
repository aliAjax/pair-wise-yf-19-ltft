import { useMemo, useState } from "react";
import {
  ACTIVE_STAGES,
  ArchiveData,
  RACK_SLOTS,
  SIGNIFICANT_DROP_GRAMS,
  Specimen,
} from "../domain/types";
import { mountSpecimen } from "../domain/archive";
import {
  applyRotation,
  occupiedSlots,
  rotationsOf,
} from "../domain/rotationRules";
import { formatDateTime, nowLocalInput, toISO } from "./format";
import { stageClassName, stageLabel } from "./stage";

interface Props {
  data: ArchiveData;
  setData: (next: ArchiveData) => void;
  onOpenDetail: (specimenNo: string) => void;
}

interface Feedback {
  type: "ok" | "error";
  text: string;
}

/** 目标架位下拉：排除被其他在架标本占用的架位 */
function useSlotOptions(data: ArchiveData, selfNo: string) {
  return useMemo(() => {
    const occupied = occupiedSlots(data);
    return RACK_SLOTS.map((slot) => ({
      slot,
      disabled: occupied.has(slot) && occupied.get(slot) !== selfNo,
      occupant: occupied.get(slot),
    }));
  }, [data, selfNo]);
}

function QueueCard({ data, setData }: Props) {
  const queue = data.specimens.filter((s) => s.dryingStage === "待干燥");
  const [selectedNo, setSelectedNo] = useState(queue[0]?.specimenNo ?? "");
  const [slot, setSlot] = useState<string>(RACK_SLOTS[0]);
  const [weight, setWeight] = useState("");
  const [time, setTime] = useState(nowLocalInput());
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const options = useSlotOptions(data, selectedNo);
  const activeNo = queue.some((s) => s.specimenNo === selectedNo)
    ? selectedNo
    : queue[0]?.specimenNo ?? "";

  if (queue.length === 0) {
    return <p className="empty">待干燥队列暂无标本，可在下方入库登记表用现有采集号入队。</p>;
  }

  const submit = () => {
    const value = Number(weight);
    if (!activeNo) return;
    if (!Number.isFinite(value) || value <= 0) {
      setFeedback({ type: "error", text: "请填写有效的首次称重（克）" });
      return;
    }
    const occupant = occupiedSlots(data).get(slot);
    if (occupant && occupant !== activeNo) {
      setFeedback({ type: "error", text: `架位 ${slot} 已被 ${occupant} 占用，本次不保存` });
      return;
    }
    setData(mountSpecimen(data, activeNo, slot, value, toISO(time)));
    setFeedback({
      type: "ok",
      text: `${activeNo} 已上架位 ${slot}，首称 ${value}g，进入干燥中`,
    });
    setWeight("");
  };

  return (
    <div className="queue-box">
      <div className="queue-list">
        {queue.map((s) => (
          <label key={s.specimenNo} className={`queue-item ${s.specimenNo === activeNo ? "selected" : ""}`}>
            <input
              type="radio"
              name="queue-specimen"
              checked={s.specimenNo === activeNo}
              onChange={() => setSelectedNo(s.specimenNo)}
            />
            <div>
              <strong>{s.specimenNo}</strong>
              <span>{s.speciesName || "未命名"}</span>
              {s.enqueuedAt && <em>入队 {formatDateTime(s.enqueuedAt)}</em>}
            </div>
          </label>
        ))}
      </div>
      <div className="mount-form">
        <label>
          <span>登记架位</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {options.map((o) => (
              <option key={o.slot} value={o.slot} disabled={o.disabled}>
                {o.slot}
                {o.disabled ? `（被 ${o.occupant} 占用）` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>首次称重 g</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            placeholder="如 42.5"
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label>
          <span>翻面时间</span>
          <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <button className="primary" onClick={submit}>
          上架并首称
        </button>
        {feedback?.text && (
          <p className={feedback.type === "ok" ? "feedback ok" : "feedback error"}>
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );
}

function ActiveCard({
  specimen,
  data,
  setData,
  onOpenDetail,
}: {
  specimen: Specimen;
  data: ArchiveData;
  setData: (next: ArchiveData) => void;
  onOpenDetail: (no: string) => void;
}) {
  const history = rotationsOf(data, specimen.specimenNo);
  const last = history[history.length - 1];
  const options = useSlotOptions(data, specimen.specimenNo);
  const [slot, setSlot] = useState<string>(
    options.find((o) => !o.disabled && o.slot !== last?.rackSlot)?.slot ?? RACK_SLOTS[0]
  );
  const [weight, setWeight] = useState("");
  const [time, setTime] = useState(nowLocalInput());
  const [remedial, setRemedial] = useState(specimen.dryingStage === "待复压");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const submit = () => {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) {
      setFeedback({ type: "error", text: "请填写有效的称重（克）" });
      return;
    }
    const outcome = applyRotation(data, {
      specimenNo: specimen.specimenNo,
      rackSlot: slot,
      turnedAt: toISO(time),
      weight: value,
      remedial,
    });
    // 拒绝时：不调用 setData —— 原架位、轮换记录和标本状态维持原样
    if (!outcome.ok) {
      setFeedback({ type: "error", text: outcome.message });
      return;
    }
    setData(outcome.data);
    setFeedback({
      type: "ok",
      text:
        outcome.stage === "待复压"
          ? "已保存：重量连续两次没有下降，转入待复压，暂不能送去鉴定"
          : outcome.stage === "已完成"
            ? `补做减重达到 ${SIGNIFICANT_DROP_GRAMS}g 以上，干燥完成，已回到待鉴定`
            : `已保存：本次减重，状态 ${stageLabel(outcome.stage)}`,
    });
    setWeight("");
  };

  const previousSlot = last?.rackSlot;

  return (
    <article className="active-card">
      <header>
        <div>
          <button className="linklike" onClick={() => onOpenDetail(specimen.specimenNo)}>
            <h3>{specimen.specimenNo}</h3>
          </button>
          <p>
            {specimen.speciesName || "未命名"} · {specimen.location}
          </p>
        </div>
        <span className={stageClassName(specimen.dryingStage)}>
          {stageLabel(specimen.dryingStage)}
        </span>
      </header>

      <div className="last-reads">
        <div>
          <small>当前架位</small>
          <strong>{previousSlot ?? "—"}</strong>
        </div>
        <div>
          <small>上次称重</small>
          <strong>{last ? `${last.weight}g` : "—"}</strong>
        </div>
        <div>
          <small>上次翻面</small>
          <strong>{last ? formatDateTime(last.turnedAt) : "—"}</strong>
        </div>
        <div>
          <small>轮换次数</small>
          <strong>{history.length}</strong>
        </div>
      </div>

      <div className="turn-form">
        <label>
          <span>本次架位（不能与 {previousSlot ?? "上次"} 相同）</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {options.map((o) => (
              <option
                key={o.slot}
                value={o.slot}
                disabled={o.disabled || o.slot === previousSlot}
              >
                {o.slot}
                {o.slot === previousSlot
                  ? "（相邻两次同架位）"
                  : o.disabled
                    ? `（被 ${o.occupant} 占用）`
                    : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>本次称重 g（高于上次则不保存）</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={weight}
            placeholder={last ? `上次 ${last.weight}g` : "称重"}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label>
          <span>翻面时间</span>
          <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={remedial}
            onChange={(e) => setRemedial(e.target.checked)}
          />
          <span>
            待复压补做（本次比上次少 {SIGNIFICANT_DROP_GRAMS}g 以上即完成、回到待鉴定）
          </span>
        </label>
        <button className="primary" onClick={submit}>
          登记翻面
        </button>
      </div>
      {feedback && (
        <p className={feedback.type === "ok" ? "feedback ok" : "feedback error"}>
          {feedback.text}
        </p>
      )}
    </article>
  );
}

function RackMap({ data }: { data: ArchiveData }) {
  const occupied = occupiedSlots(data);
  return (
    <div className="rack-map">
      {RACK_SLOTS.map((slot) => {
        const no = occupied.get(slot);
        return (
          <div key={slot} className={no ? "rack-cell busy" : "rack-cell free"}>
            <b>{slot}</b>
            <span>{no ?? "空闲"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RotationWorkbench({ data, setData, onOpenDetail }: Props) {
  const active = data.specimens.filter((s) => ACTIVE_STAGES.includes(s.dryingStage));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>轮换工作台</p>
          <h2>干燥架翻面登记</h2>
        </div>
      </div>

      <h3 className="subhead">待干燥队列 · 首次上架</h3>
      <QueueCard data={data} setData={setData} onOpenDetail={onOpenDetail} />

      <h3 className="subhead">架位占用图</h3>
      <RackMap data={data} />

      <h3 className="subhead">在架标本（{active.length}）</h3>
      {active.length === 0 ? (
        <p className="empty">干燥架上暂无标本。</p>
      ) : (
        <div className="active-grid">
          {active.map((s) => (
            <ActiveCard
              key={s.specimenNo}
              specimen={s}
              data={data}
              setData={setData}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </section>
  );
}
