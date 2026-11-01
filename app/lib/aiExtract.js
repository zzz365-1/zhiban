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
  new RegExp("^(今天|明天|后天|大后天|次日|隔天|即日)$"),
  new RegExp(
    "^(下一周|下个星期|这个星期|这个周|本|这|下)?(周|星期)[一二三四五六日天]$"
  ),
  new RegExp("^(本月|下月)?(底|初|末)$"),
  new RegExp("^[0-9]{1,2}月(底|初|末)$"),
  new RegExp("^(本月|下月)[0-9]{1,2}[日号]$"),
  // 过X天/周/个星期/个月/年，或 X天/日/周/个星期/个月/年后缀
  new RegExp(
    "^(?:过[0-9一二三四五六七八九十两]+(?:天|日|周|个星期|个月|年)|[0-9一二三四五六七八九十两]+(?:天|日|周|个?星期|个月|年)(?:之内|以内|内|之后|以后|后))$"
  ),
];

/**
 * 判断一个 deadline 字符串是否是“模糊日期”。
 * 例：“明天”“下周三”“三天内”“一个月后”都算模糊。
 * 注意：“三月之后”不在此列——它语义含糊，本地不认，
 * 由 extractNotice 原样抽出后交给 AI 兜底判断。
 */
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
 * 【日期和时间必须同源】
 * 一条通知里有两个日期时，本地抓到的“时间”可能是活动开始时间，
 * 而 AI 补上的是截止日期，两者拼起来会得到原文里不存在的时刻。
 * 所以 deadline 和 time 作为一组不可拆字段，同来源同取舍。
 *
 * deadline 顺序：
 *   1. 本地已通过 relativeDate 换算确定具体日期 → 用本地的
 *   2. AI 给了 deadline → 用 AI 的
 *   3. 本地是模糊日期（AI 也搞不定）→ 留空，绝不退回模糊原文
 *   4. 否则用本地的
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