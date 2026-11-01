/**
 * 模式与内容匹配检查。纯函数，页面和自检脚本共用。
 *
 * 用途：用户粘贴内容后，快速判断“当前选择的模式”和“内容实际条数”是否对得上，
 * 对不上时给出提醒。提醒只是建议，用户可以选择保持当前模式。
 *
 * 原则：
 *   - 拿不准（detectNoticeCount 返回 confident=false）→ 不提醒
 *   - 确定条数与模式一致 → 不提醒
 *   - 确定条数与模式不一致 → 提醒，给出建议模式
 */

import { detectNoticeCount } from "./splitNotices.js";

/**
 * @param {string} rawText 粘贴的内容
 * @param {"single"|"multi"} mode 当前选择的模式
 * @returns {{
 *   shouldWarn: boolean,
 *   detectedCount: number|null,
 *   suggestedMode: "single"|"multi"|null,
 *   message: string
 * }}
 */
export function checkModeMismatch(rawText, mode) {
  const text = String(rawText || "").trim();

  if (!text) {
    return {
      shouldWarn: false,
      detectedCount: null,
      suggestedMode: null,
      message: "",
    };
  }

  const { count, confident } = detectNoticeCount(text);

  // 拿不准时不提醒，按用户选的模式走
  if (!confident || count === null) {
    return {
      shouldWarn: false,
      detectedCount: null,
      suggestedMode: null,
      message: "",
    };
  }

  // 单条模式 + 内容 ≥2 条
  if (mode === "single" && count >= 2) {
    return {
      shouldWarn: true,
      detectedCount: count,
      suggestedMode: "multi",
      message:
        "这段内容看起来像是 " +
        count +
        " 条通知，你现在选的是「单条通知」。要切换到「多通知」吗？",
    };
  }

  // 多通知模式 + 内容只有 1 条
  if (mode === "multi" && count === 1) {
    return {
      shouldWarn: true,
      detectedCount: 1,
      suggestedMode: "single",
      message:
        "这段内容看起来只有 1 条通知，你现在选的是「多通知」。要切换到「单条通知」吗？",
    };
  }

  return {
    shouldWarn: false,
    detectedCount: count,
    suggestedMode: null,
    message: "",
  };
}