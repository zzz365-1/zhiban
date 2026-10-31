/**
 * 通知对象的纯函数操作。页面和自检脚本共用同一份。
 */

import { buildDeadlineDate } from "./deadline.js";

/**
 * 对一条通知应用手动修改，返回新对象（不修改原对象）。
 *
 * 做的事情：
 *   1. 合并 patch 到 analysis
 *   2. 来源标记改为 "manual"
 *   3. 如果 title 被改，同步 notice.title（左侧列表显示的是它）
 *   4. 重新计算 deadlineDate（左侧剩余天数、日历格子、待办都靠它）
 */
export function updateNoticeAnalysis(notice, patch) {
  const newAnalysis = {
    ...notice.analysis,
    ...patch,
    _source: "manual",
  };

  const deadlineDate = buildDeadlineDate(newAnalysis.deadline, newAnalysis.time);

  return {
    ...notice,
    title: newAnalysis.title || notice.title,
    analysis: newAnalysis,
    deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
  };
}