import { useState } from "react";
import "./styles.css";
import { useArchive } from "./hooks/useArchive";
import { clearArchive } from "./domain/archive";
import { Metrics } from "./components/Metrics";
import { FilterPanel } from "./components/FilterPanel";
import { SpecimenForm } from "./components/SpecimenForm";
import { RotationWorkbench } from "./components/RotationWorkbench";
import { LocationCards } from "./components/LocationCards";
import { CabinetRecords } from "./components/CabinetRecords";
import { SpecimenDetail } from "./components/SpecimenDetail";

function App() {
  const { data, setData } = useArchive();
  const [detailNo, setDetailNo] = useState<string | null>(null);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62007 · 植物标本馆 · Port 62007</p>
        <h1>植物标本馆入库 · 干燥轮换工作台</h1>
        <span>
          压好的标本凭采集号进入待干燥队列，逐次登记架位、翻面时间与称重：相邻两次不得停在同一架位，
          重量连续两次没有下降即转待复压且不能送去鉴定；架位被占用或称得比上次重时本次不保存。
          待复压标本补做一次明显减重后回到待鉴定。所有卡片、队列、柜位与详情页共用同一份浏览器数据。
        </span>
      </section>

      <div className="toolbar">
        <button
          onClick={() => {
            if (window.confirm("确认恢复为初始演示资料？当前修改将被覆盖。")) {
              setData(clearArchive());
            }
          }}
        >
          恢复演示数据
        </button>
        <span className="muted">数据保存在本浏览器 localStorage，重开仍可查询</span>
      </div>

      <Metrics data={data} />

      <RotationWorkbench data={data} setData={setData} onOpenDetail={setDetailNo} />

      <SpecimenForm data={data} setData={setData} />

      <FilterPanel data={data} onOpenDetail={setDetailNo} />

      <LocationCards data={data} onOpenDetail={setDetailNo} />

      <CabinetRecords data={data} setData={setData} onOpenDetail={setDetailNo} />

      <SpecimenDetail data={data} specimenNo={detailNo} onClose={() => setDetailNo(null)} />
    </main>
  );
}

export default App;
