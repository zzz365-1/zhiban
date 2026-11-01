/**
 * 解析单条通知的纯逻辑，不碰 React state。
 *
 * 日期策略：
 *   1. 本地规则抽出 deadline
 *   2. 如果 deadline 是相对日期，本地尝试换算成具体日期
 *   3. 换算成功 → 不调 AI（前提 location 也有）
 *   4. 换算失败或 location 缺失 → 调 AI 兜底
 *   5. AI 返回的 deadline 如果仍是相对日期，本地再尝试换算一次
 *   6. AI 不可用时退回 rule_fallback，此时 deadline 已是本地换算结果
 *
 * 永不抛异常。
 */

import { extractNotice } from "./extractNotice.js";
import {
  isRuleResultGood,
  callAIExtract,
  mergeAIResult,
  isFuzzyDate,
} from "./aiExtract.js";
import { resolveRelativeDate } from "./relativeDate.js";

export async function parseOne(text) {
  const now = new Date();
  const ruleResult = extractNotice(text);

  // 本地优先换算相对日期
  if (ruleResult.deadline && isFuzzyDate(ruleResult.deadline)) {
    const resolved = resolveRelativeDate(ruleResult.deadline, now);
    if (resolved) {
      ruleResult.deadline = resolved.normalized;
      ruleResult._locallyResolved = true;
    }
  }

  if (isRuleResultGood(ruleResult)) {
    return { analysis: { ...ruleResult, _source: "rule" } };
  }

  try {
    const aiResult = await callAIExtract(text);
    const merged = mergeAIResult(ruleResult, aiResult);

    // AI 返回的 deadline 如果仍是相对日期，本地再换算一次
    if (merged.deadline && isFuzzyDate(merged.deadline)) {
      const resolved = resolveRelativeDate(merged.deadline, now);
      if (resolved) {
        merged.deadline = resolved.normalized;
        merged._locallyResolved = true;
        merged._inferredDeadline = false;
      }
    }

    return { analysis: merged };
  } catch (e) {
    return {
      analysis: { ...ruleResult, _source: "rule_fallback" },
      error: String(e?.message || e),
    };
  }
}