import { ArchiveData } from "../domain/types";

export function Metrics({ data }: { data: ArchiveData }) {
  const queueCount = data.specimens.filter((s) => s.dryingStage === "待干燥").length;
  const identifyCount = data.specimens.filter(
    (s) => s.dryingStage === "已完成" || s.identifyStatus === "待鉴定"
  ).length;
  const shelvedCount = data.specimens.filter((s) => s.pressStatus === "已入库").length;
  const siteCount = new Set(data.specimens.map((s) => s.location)).size;

  const metrics = [
    { label: "待干燥队列", value: queueCount },
    { label: "待鉴定", value: identifyCount },
    { label: "已上柜", value: shelvedCount },
    { label: "采集点", value: siteCount },
  ];

  return (
    <section className="metrics">
      {metrics.map((metric) => (
        <article key={metric.label}>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}
