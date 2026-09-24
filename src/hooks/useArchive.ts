import { useCallback, useEffect, useState } from "react";
import { ArchiveData } from "../domain/types";
import { loadArchive, saveArchive } from "../domain/archive";

/**
 * 全应用唯一的浏览器数据入口：采集地点卡、待干燥队列、
 * 柜位记录和详情页都读取同一份 state；每次变更即时写入
 * localStorage，重开浏览器仍可查询。
 */
export function useArchive() {
  const [data, setData] = useState<ArchiveData>(() => loadArchive());

  useEffect(() => {
    saveArchive(data);
  }, [data]);

  // 多标签页之间同步同一份浏览器数据
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key) setData(loadArchive());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((producer: (prev: ArchiveData) => ArchiveData) => {
    setData((prev) => producer(prev));
  }, []);

  return { data, setData, update };
}
