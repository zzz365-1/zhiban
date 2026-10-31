/**
 * 解析单条通知的纯逻辑，不碰 React state。
 * 页面里的单条解析和批量解析共用这一份。
 *
 * 永不抛异常。AI 失败时返回 rule_fallback。
 */

import { extractNotice } from "./extractNotice.js";
import { isRuleResultGood, callAIExtract, mergeAIResult } from "./aiExtract.js";

/**
 * @param {string} text
 * @returns {Promise<{ analysis: object, error?: string }>}
 */
export async function parseOne(text) {
  const ruleResult = extractNotice(text);

  if (isRuleResultGood(ruleResult)) {
    return { analysis: { ...ruleResult, _source: "rule" } };
  }

  try {
    const aiResult = await callAIExtract(text);
    return { analysis: mergeAIResult(ruleResult, aiResult) };
  } catch (e) {
    return {
      analysis: { ...ruleResult, _source: "rule_fallback" },
      error: String(e?.message || e),
    };
  }
}