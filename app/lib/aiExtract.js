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

export function isRuleResultGood(ruleResult) {
  if (!ruleResult) return false;
  if (!ruleResult.deadline) return false;
  if (isFuzzyDate(ruleResult.deadline)) return false;
  if (!ruleResult.location) return false;
  return true;
}

/**
 * 合并 AI 结果。
 *
 * deadline/time 策略：
 *   - 本地已通过相对日期换算确定了具体日期（_locallyResolved）→ 用本地的
 *   - 否则 AI 给了 deadline → 用 AI 的（AI 只负责“选哪个日期”，不负责换算）
 *   - 否则本地是模糊日期 → 留空
 *   - 否则用本地的
 *
 * location / audience：AI 优先，本地兜底。
 * materials：整套用一边，绝不拼接。
 */
export function mergeAIResult(ruleResult, aiResult) {
  const base = ruleResult || {};
  const baseDeadlineIsResolved =
    Boolean(base._locallyResolved) && Boolean(base.deadline);
  const baseDeadlineIsFuzzy =
    Boolean(base.deadline) && isFuzzyDate(base.deadline);

  let deadline;
  let time;
  let inferred = false;

  if (baseDeadlineIsResolved) {
    deadline = base.deadline;
    time = base.time;
  } else if (aiResult.deadline) {
    deadline = aiResult.deadline;
    time = aiResult.time || null;
    if (baseDeadlineIsFuzzy) inferred = true;
  } else if (baseDeadlineIsFuzzy) {
    deadline = null;
    time = null;
  } else {
    deadline = base.deadline || null;
    time = base.time || null;
  }

  const aiMaterials = Array.isArray(aiResult.materials)
    ? aiResult.materials.filter((x) => typeof x === "string" && x.trim())
    : [];
  const materials = aiMaterials.length > 0 ? aiMaterials : base.materials || [];

  const audience = aiResult.audience || base.audience || null;

  return {
    deadline,
    time,
    location: aiResult.location || base.location || null,
    materials,
    audience,
    title: aiResult.title || null,
    summary: aiResult.summary || null,
    category: aiResult.category || null,
    _source: "mixed",
    _inferredDeadline: inferred,
  };
}