import { DryingStage } from "../domain/types";

const STAGE_LABEL: Record<DryingStage, string> = {
  未上干燥架: "未上干燥架",
  待干燥: "待干燥队列",
  干燥中: "干燥中",
  待复压: "待复压",
  已完成: "已完成·待鉴定",
};

export function stageLabel(stage: DryingStage): string {
  return STAGE_LABEL[stage];
}

export function stageClassName(stage: DryingStage): string {
  switch (stage) {
    case "待复压":
      return "badge badge-warn";
    case "已完成":
      return "badge badge-done";
    case "待干燥":
      return "badge badge-queue";
    default:
      return "badge";
  }
}
