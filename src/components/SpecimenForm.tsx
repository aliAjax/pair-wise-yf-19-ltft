import { useState } from "react";
import { ArchiveData, PressStatus } from "../domain/types";
import { addSpecimen, enqueueSpecimen, newSpecimenDraft } from "../domain/archive";

interface Props {
  data: ArchiveData;
  setData: (next: ArchiveData) => void;
}

const EMPTY = {
  specimenNo: "",
  speciesName: "",
  location: "",
  altitude: "",
  habitat: "",
  collector: "",
};

/** 入库登记：录入新标本；压好的标本用现有采集号直接进入待干燥队列 */
export function SpecimenForm({ data, setData }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [pressStatus, setPressStatus] = useState<PressStatus>("已压制");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = () => {
    if (!form.specimenNo.trim()) {
      setMessage({ type: "error", text: "采集号为必填项" });
      return;
    }
    const no = form.specimenNo.trim();
    if (data.specimens.some((s) => s.specimenNo === no)) {
      setMessage({ type: "error", text: `采集号 ${no} 已存在，请直接在下方用该号入队` });
      return;
    }
    const specimen = newSpecimenDraft({
      ...form,
      specimenNo: no,
      pressStatus,
    });
    setData(addSpecimen(data, specimen));
    setMessage({ type: "ok", text: `标本 ${no} 已录入（${pressStatus}）` });
    setForm(EMPTY);
  };

  const enqueue = () => {
    const no = form.specimenNo.trim();
    if (!no) {
      setMessage({ type: "error", text: "请填写现有采集号后再进入待干燥队列" });
      return;
    }
    const target = data.specimens.find((s) => s.specimenNo === no);
    if (!target) {
      setMessage({ type: "error", text: `找不到采集号 ${no}，请先录入该标本` });
      return;
    }
    if (target.dryingStage === "待干燥") {
      setMessage({ type: "error", text: `${no} 已在待干燥队列中` });
      return;
    }
    if (target.dryingStage === "干燥中" || target.dryingStage === "待复压") {
      setMessage({ type: "error", text: `${no} 已在干燥架上（${target.dryingStage}）` });
      return;
    }
    setData(enqueueSpecimen(data, no));
    setMessage({ type: "ok", text: `${no} 已进入待干燥队列` });
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>入库登记</p>
          <h2>新增标本 / 压好入队</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>采集号 *</span>
          <input value={form.specimenNo} onChange={set("specimenNo")} placeholder="如 HX-240624-05" />
        </label>
        <label>
          <span>物种名称</span>
          <input value={form.speciesName} onChange={set("speciesName")} placeholder="填写物种名称" />
        </label>
        <label>
          <span>采集地点</span>
          <input value={form.location} onChange={set("location")} placeholder="填写采集地点" />
        </label>
        <label>
          <span>海拔</span>
          <input value={form.altitude} onChange={set("altitude")} placeholder="如 1420m" />
        </label>
        <label>
          <span>生境描述</span>
          <input value={form.habitat} onChange={set("habitat")} placeholder="填写生境描述" />
        </label>
        <label>
          <span>采集人</span>
          <input value={form.collector} onChange={set("collector")} placeholder="填写采集人" />
        </label>
        <label>
          <span>压制状态</span>
          <select
            value={pressStatus}
            onChange={(e) => setPressStatus(e.target.value as PressStatus)}
          >
            <option value="待压制">待压制</option>
            <option value="已压制">已压制</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="primary" onClick={save}>
          保存档案
        </button>
        <button onClick={enqueue}>用此采集号进入待干燥队列</button>
      </div>
      {message && (
        <p className={message.type === "ok" ? "feedback ok" : "feedback error"}>{message.text}</p>
      )}
    </section>
  );
}
