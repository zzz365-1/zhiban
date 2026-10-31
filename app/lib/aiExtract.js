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

/**
 * 判断规则结果是否“足够好”。
 */
export function isRuleResultGood(ruleResult) {
  if (!ruleResult) return false;
  return Boolean(ruleResult.deadline) && Boolean(ruleResult.location);
}

/**
 * 把 AI 返回的结果合并进规则结果。
 *
 * 核心原则：
 * - deadline 与 time 是不可拆分的一组。只要 AI 给出了 deadline，
 *   就整组使用 AI 的（AI 的 time 即使是 null 也不回退到本地），
 *   避免“日期来自模型、时间来自规则”这种跨来源拼接错误。
 * - AI 没有给出 deadline 时，整组使用本地规则结果。
 * - location 独立判断，AI 优先，AI 没给才用本地。
 * - materials / audience AI 不返回，保持本地规则结果。
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