// 页面交互：轮换工作台的 React 组件层。
// 只负责读状态、收集表单输入和渲染；持久化走 src/archive.ts，
// 轮换规则走 src/rotation.ts。

import { useMemo, useState } from "react";
import {
  dryingQueue,
  findLocation,
  listSpecimens,
  loadArchive,
  occupiedRacks,
  resetArchive,
  rotationsOf,
  saveArchive,
} from "./archive";
import {
  SIGNIFICANT_LOSS_GRAMS,
  SIGNIFICANT_LOSS_RATIO,
  enqueueForDrying,
  storeInCabinet,
  submitRotation,
} from "./rotation";
import type {
  ArchiveData,
  Specimen,
  SpecimenStatus,
} from "./types";

const STATUS_FILTERS: Array<SpecimenStatus | "全部"> = [
  "全部",
  "待压制",
  "待干燥",
  "干燥中",
  "待复压",
  "待鉴定",
  "已入库",
];

const STATUS_LABEL: Record<SpecimenStatus, string> = {
  待压制: "待压制",
  待干燥: "待干燥",
  干燥中: "干燥中",
  待复压: "待复压",
  待鉴定: "待鉴定",
  已入库: "已入库",
};

interface Notice {
  type: "ok" | "error";
  text: string;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatTime(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function StatusBadge({ status }: { status: SpecimenStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export default function Workbench() {
  const [data, setData] = useState<ArchiveData>(() => loadArchive());
  const [filter, setFilter] = useState<SpecimenStatus | "全部">("全部");
  const [detailNo, setDetailNo] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 入队表单：凭现有采集号
  const [enqueueNo, setEnqueueNo] = useState("");

  // 各队列项的轮换表单（一份标本一份草稿，保存失败时草稿保留、存档不动）
  const [rackDraft, setRackDraft] = useState<Record<string, string>>({});
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});

  // 待鉴定标本的上柜柜位草稿
  const [cabinetDraft, setCabinetDraft] = useState<Record<string, string>>({});

  const specimens = useMemo(() => listSpecimens(data), [data]);
  const queue = useMemo(() => dryingQueue(data), [data]);
  const racks = useMemo(() => occupiedRacks(data), [data]);

  const metrics = useMemo(() => {
    const count = (s: SpecimenStatus) =>
      specimens.filter((x) => x.status === s).length;
    return [
      { label: "待干燥队列", value: queue.length },
      { label: "待鉴定", value: count("待鉴定") },
      { label: "待复压", value: count("待复压") },
      { label: "已上柜", value: count("已入库") },
    ];
  }, [specimens, queue.length]);

  const detail = detailNo ? data.specimens[detailNo] : null;
  const detailLogs = detailNo ? rotationsOf(data, detailNo) : [];

  const flash = (n: Notice) => {
    setNotice(n);
    window.setTimeout(() => setNotice(null), 4200);
  };

  const commit = (next: ArchiveData) => {
    saveArchive(next);
    setData(next);
  };

  const handleEnqueue = () => {
    const no = enqueueNo.trim();
    if (!no) {
      flash({ type: "error", text: "请填写采集号" });
      return;
    }
    const draft: ArchiveData = JSON.parse(JSON.stringify(data));
    const result = enqueueForDrying(draft, no, new Date().toISOString());
    if (!result.ok) {
      flash({ type: "error", text: result.reason ?? "入队失败" });
      return;
    }
    commit(draft);
    setEnqueueNo("");
    flash({ type: "ok", text: `${no} 已进入待干燥队列` });
  };

  const handleRotation = (s: Specimen) => {
    const rack = (rackDraft[s.collectingNo] ?? "").trim();
    const flippedAt = timeDraft[s.collectingNo] ?? "";
    const weight = Number(weightDraft[s.collectingNo]);
    const result = submitRotation(data, {
      collectingNo: s.collectingNo,
      rackPosition: rack,
      flippedAt: flippedAt ? new Date(flippedAt).toISOString() : "",
      weight: Number.isFinite(weight) ? weight : NaN,
    });
    if (!result.ok || !result.data) {
      // 规则：失败不保存 —— 不调用 commit，存档与标本状态原样保留
      flash({ type: "error", text: result.reason ?? "本次轮换不保存" });
      return;
    }
    commit(result.data);
    setRackDraft((m) => ({ ...m, [s.collectingNo]: "" }));
    setWeightDraft((m) => ({ ...m, [s.collectingNo]: "" }));
    flash({
      type: "ok",
      text:
        result.specimen.status === "待复压"
          ? `${s.collectingNo} 连续两次未减重，已转待复压，不能送鉴定`
          : result.specimen.status === "待鉴定"
          ? `${s.collectingNo} 明显减重达标，回到待鉴定`
          : `${s.collectingNo} 轮换登记成功，当前架位 ${rack}`,
    });
  };

  const handleStore = (s: Specimen) => {
    const position = (cabinetDraft[s.collectingNo] ?? "").trim();
    const result = storeInCabinet(
      data,
      s.collectingNo,
      position,
      new Date().toISOString()
    );
    if (!result.ok || !result.data) {
      flash({ type: "error", text: result.reason ?? "上柜失败" });
      return;
    }
    commit(result.data);
    setCabinetDraft((m) => ({ ...m, [s.collectingNo]: "" }));
    flash({ type: "ok", text: `${s.collectingNo} 已鉴定上柜：${position}` });
  };

  const handleReset = () => {
    if (!window.confirm("恢复演示数据？当前本机存档会被清空。")) return;
    setData(resetArchive());
    setDetailNo(null);
    flash({ type: "ok", text: "已恢复演示数据" });
  };

  const filtered = specimens.filter(
    (s) => filter === "全部" || s.status === filter
  );
  const waitingIdentify = specimens.filter((s) => s.status === "待鉴定");

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62007 · 干燥轮换工作台</p>
        <h1>植物标本馆压制标本干燥轮换</h1>
        <span>
          标本压好后凭现有采集号进入待干燥队列，每次上/换架登记架位、翻面时间与称重。
          相邻两次不停同一架位；重量连续两次未下降转待复压；架位被占或称重回升则本次不保存。
          地点卡、队列、柜位记录与详情页共用同一份浏览器存档，重开仍可查询。
        </span>
      </section>

      {notice && (
        <div className={`notice notice-${notice.type}`}>{notice.text}</div>
      )}

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>状态筛选</h2>
          <div className="chips">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                className={filter === f ? "chip-active" : ""}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <h2 className="mt">入待干燥队列</h2>
          <p className="hint">标本压好后，用现有采集号登记上架。</p>
          <div className="inline-form">
            <input
              list="collecting-nos"
              placeholder="现有采集号，如 HX-240615-01"
              value={enqueueNo}
              onChange={(e) => setEnqueueNo(e.target.value)}
            />
            <datalist id="collecting-nos">
              {specimens
                .filter((s) => s.status === "待压制")
                .map((s) => (
                  <option key={s.collectingNo} value={s.collectingNo} />
                ))}
            </datalist>
            <button className="primary" onClick={handleEnqueue}>
              进入队列
            </button>
          </div>

          <h2 className="mt">当前架位占用</h2>
          {racks.size === 0 ? (
            <p className="hint">暂无在架标本</p>
          ) : (
            <ul className="rack-list">
              {[...racks.entries()].map(([rack, no]) => (
                <li key={rack}>
                  <b>{rack}</b>
                  <span>{no}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="ghost" onClick={handleReset}>
            恢复演示数据
          </button>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>DRYING QUEUE</p>
              <h2>待干燥 / 干燥中 / 待复压</h2>
            </div>
          </div>

          {queue.length === 0 ? (
            <p className="hint">队列暂无标本，可在左侧把待压制标本送入队列。</p>
          ) : (
            <div className="queue">
              {queue.map((s) => {
                const history = rotationsOf(data, s.collectingNo);
                const last = history[history.length - 1];
                return (
                  <article key={s.collectingNo} className="queue-card">
                    <div className="queue-head">
                      <div>
                        <h3>{s.collectingNo}</h3>
                        <p>
                          {s.species} · {s.locationName}
                          {s.elevation ? ` · ${s.elevation}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>

                    <dl className="last-state">
                      <dt>上次架位</dt>
                      <dd>{last ? last.rackPosition : "—（首次上架）"}</dd>
                      <dt>上次称重</dt>
                      <dd>{last ? `${last.weight} g` : "—"}</dd>
                      <dt>上次翻面</dt>
                      <dd>{last ? formatTime(last.flippedAt) : "—"}</dd>
                    </dl>

                    {s.status === "待复压" && (
                      <p className="warn">
                        重量连续两次没有下降，已转待复压。补做一次明显减重（≥
                        {SIGNIFICANT_LOSS_GRAMS}g 或 ≥
                        {SIGNIFICANT_LOSS_RATIO * 100}%）后才回到待鉴定。
                      </p>
                    )}

                    <div className="rotation-form">
                      <label>
                        <span>本次架位</span>
                        <input
                          placeholder="如 A-03"
                          value={rackDraft[s.collectingNo] ?? ""}
                          onChange={(e) =>
                            setRackDraft((m) => ({
                              ...m,
                              [s.collectingNo]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>翻面时间</span>
                        <input
                          type="datetime-local"
                          value={timeDraft[s.collectingNo] ?? nowLocalInput()}
                          onChange={(e) =>
                            setTimeDraft((m) => ({
                              ...m,
                              [s.collectingNo]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>称重（克）</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={last ? `上次 ${last.weight}g` : "首次称重"}
                          value={weightDraft[s.collectingNo] ?? ""}
                          onChange={(e) =>
                            setWeightDraft((m) => ({
                              ...m,
                              [s.collectingNo]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        className="primary"
                        onClick={() => handleRotation(s)}
                      >
                        登记轮换
                      </button>
                    </div>

                    <button
                      className="link"
                      onClick={() => setDetailNo(s.collectingNo)}
                    >
                      查看详情与轮换记录 →
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section className="lower-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p>WAITING IDENTIFY</p>
              <h2>待鉴定 / 上柜</h2>
            </div>
          </div>
          {waitingIdentify.length === 0 ? (
            <p className="hint">暂无待鉴定标本。</p>
          ) : (
            <div className="records">
              {waitingIdentify.map((s) => (
                <article key={s.collectingNo}>
                  <b>鉴</b>
                  <div className="grow">
                    <h3>{s.collectingNo}</h3>
                    <p>
                      {s.species} · {s.locationName}
                    </p>
                    <div className="inline-form tight">
                      <input
                        placeholder="鉴定后柜位，如 B-12-04"
                        value={cabinetDraft[s.collectingNo] ?? ""}
                        onChange={(e) =>
                          setCabinetDraft((m) => ({
                            ...m,
                            [s.collectingNo]: e.target.value,
                          }))
                        }
                      />
                      <button onClick={() => handleStore(s)}>确认上柜</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>LOCATION CARDS</p>
              <h2>采集地点卡</h2>
            </div>
          </div>
          <div className="location-grid">
            {data.locations.map((loc) => (
              <article key={loc.name} className="location-card">
                <h3>{loc.name}</h3>
                <p>{loc.region}</p>
                <dl>
                  <dt>海拔</dt>
                  <dd>{loc.elevation}</dd>
                  <dt>生境</dt>
                  <dd>{loc.habitat}</dd>
                  {loc.note && (
                    <>
                      <dt>备注</dt>
                      <dd>{loc.note}</dd>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>CABINETS</p>
              <h2>馆藏柜位记录</h2>
            </div>
          </div>
          {data.cabinets.length === 0 ? (
            <p className="hint">暂无上柜记录。</p>
          ) : (
            <ul className="cabinet-list">
              {data.cabinets.map((c) => (
                <li key={c.collectingNo}>
                  <b>{c.cabinetPosition}</b>
                  <span>
                    {c.collectingNo} · {c.species}
                  </span>
                  <small>{formatTime(c.storedAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>ALL SPECIMENS</p>
            <h2>标本总览（{filter}）</h2>
          </div>
        </div>
        <div className="records">
          {filtered.map((s) => {
            const loc = findLocation(data, s.locationName);
            return (
              <article key={s.collectingNo} className="specimen-row">
                <b>{s.collectingNo.slice(-2)}</b>
                <div className="grow">
                  <h3>{s.collectingNo}</h3>
                  <p>
                    {s.species} · {s.locationName}
                    {loc ? `（${loc.elevation} / ${loc.habitat}）` : ""}
                    {s.collector ? ` · 采集人 ${s.collector}` : ""}
                  </p>
                </div>
                <StatusBadge status={s.status} />
                <button className="ghost" onClick={() => setDetailNo(s.collectingNo)}>
                  详情
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {detail && (
        <div className="modal-mask" onClick={() => setDetailNo(null)}>
          <section className="modal panel" onClick={(e) => e.stopPropagation()}>
            <div className="heading">
              <div>
                <p>SPECIMEN DETAIL</p>
                <h2>{detail.collectingNo}</h2>
              </div>
              <button className="ghost" onClick={() => setDetailNo(null)}>
                关闭
              </button>
            </div>
            <dl className="detail-grid">
              <dt>物种名称</dt>
              <dd>{detail.species}</dd>
              <dt>采集地点</dt>
              <dd>{detail.locationName}</dd>
              <dt>海拔</dt>
              <dd>{detail.elevation ?? "—"}</dd>
              <dt>生境描述</dt>
              <dd>{detail.habitat ?? "—"}</dd>
              <dt>采集人</dt>
              <dd>{detail.collector ?? "—"}</dd>
              <dt>当前状态</dt>
              <dd>
                <StatusBadge status={detail.status} />
              </dd>
              <dt>馆藏位置</dt>
              <dd>{detail.cabinetPosition ?? "—"}</dd>
              <dt>入队时间</dt>
              <dd>{detail.queuedAt ? formatTime(detail.queuedAt) : "—"}</dd>
            </dl>
            <h3>轮换记录</h3>
            {detailLogs.length === 0 ? (
              <p className="hint">暂无轮换记录。</p>
            ) : (
              <table className="rotation-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>翻面时间</th>
                    <th>架位</th>
                    <th>称重</th>
                    <th>较上次</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLogs.map((log, i) => (
                    <tr key={log.id} className={log.stalled ? "stalled" : ""}>
                      <td>{i + 1}</td>
                      <td>{formatTime(log.flippedAt)}</td>
                      <td>{log.rackPosition}</td>
                      <td>{log.weight} g</td>
                      <td>
                        {log.delta === null
                          ? "首次"
                          : log.delta === 0
                          ? "持平"
                          : log.delta > 0
                          ? `+${log.delta} g`
                          : `${log.delta} g`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
