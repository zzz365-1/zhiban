/**
 * 客户端调用 /api/parse 的薄封装。
 */

export async function callAIExtract(text) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error("HTTP " + res.status);
  }

  const data = await res.json();

  if (!data?.ok || !data?.result) {
    throw new Error(data?.error || "ai_failed");
  }

  return data.result;
}

// 模糊日期模式：本地规则能抽出原文，但无法换算成具体日期
const FUZZY_DATE_PATTERNS = [
  new RegExp("^(今天|明天|后天|大后天)$"),
  new RegExp("^(本|这|下)?(周|星期)[一二三四五六日天]$"),
  new RegExp("^(本月|下月)?(底|初|末)$"),
  new RegExp("^[0-9]{1,2}月(底|初|末)$"),
  new RegExp("^(本月|下月)[0-9]{1,2}[日号]$"),
];

export function isFuzzyDate(s) {
  if (!s) return false;
  const t = String(s).trim();
  for (const re of FUZZY_DATE_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * 判断规则结果是否“足够好”。
 * 模糊日期（明天、本周五、本月底、下周三等）视为未抽到，
 * 触发 AI 兜底去换算。
 */
export function isRuleResultGood(ruleResult) {
  if (!ruleResult) return false;
  if (!ruleResult.deadline) return false;
  if (isFuzzyDate(ruleResult.deadline)) return false;
  if (!ruleResult.location) return false;
  return true;
}

/**
 * 合并 AI 结果。
 * deadline 与 time 绑定为同一来源，避免跨来源拼接。
 */
export function mergeAIResult(ruleResult, aiResult) {
  const base = ruleResult || {};

  let deadline;
  let time;
  if (aiResult.deadline) {
    deadline = aiResult.deadline;
    time = aiResult.time || null;
  } else {
    deadline = base.deadline || null;
    time = base.time || null;
  }

  return {
    deadline,
    time,
    location: aiResult.location || base.location || null,
    materials: base.materials || [],
    audience: base.audience || null,
    title: aiResult.title || null,
    summary: aiResult.summary || null,
    category: aiResult.category || null,
    _source: "mixed",
  };
}