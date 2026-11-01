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
  // X天内 / X天后 / X周内 / X周后 / X个月内 / X个月后 / X年内 / X年后 / 过X天
  new RegExp(
    "^(?:过[0-9一二三四五六七八九十两]+(?:天|日)|[0-9一二三四五六七八九十两]+(?:天|日|周|个?星期|个?月|个?年)(?:之内|以内|内|之后|以后|后))$"
  ),
];

/**
 * 判断一个 deadline 字符串是否是“模糊日期”（无法直接用来算剩余天数）。
 * 例：“明天”“下周三”“本月底”“三天内”“一个月后”都算模糊。
 */
export function isFuzzyDate(s) {
  if (!s) return false;
  const t = String(s).trim();
  for (const re of FUZZY_DATE_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * 判断规则结果是否“足够好”，够好就不调 AI，省时省钱。
 *
 * 【为什么模糊日期视为未抽到】
 * “明天”“下周三”“本月底”这类相对说法，本地规则能抽出原文，
 * 但如果没有基准日期就无法换算成具体日期，用户看到这个字符串也没法行事。
 * 所以视同“没抽到”，触发 AI 兜底去换算。
 * （注：现在这些说法会被 relativeDate.js 优先本地换算，
 *   换算成功就不触发 AI；只有本地算不出来时才真正兜底到 AI。）
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
 *
 * 【为什么日期和时间必须同源，不能各取一半】
 * 真实踩过坑：一条通知里有两个日期——活动开始 11月8日 19:00，截止报名 11月6日。
 * 本地规则抓到的“时间”是活动开始时间 19:00；
 * 而 AI 补上了真正的截止日期 11月6日。
 * 如果按“日期用 AI 的、时间用本地的”拼接，就会得到 11月6日 19:00。
 * 但这个时间点在原文里根本不存在——活动是 8 号 19:00，截止是 6 号但没说几点。
 * 更糟的是这种错误在界面上完全看不出来，导出的日历还带着 19:00 的提醒，
 * 用户按这个时间准备，结果当天下午才是活动开始时间，已经错过了截止。
 * 所以 deadline 和 time 必须当成一组不可拆的字段，同来源同取舍。
 *
 * deadline 取舍顺序：
 *   1. 本地已通过 relativeDate 换算确定具体日期（_locallyResolved）→ 用本地的
 *   2. AI 给了 deadline → 用 AI 的（AI 只负责“选哪个日期”，不负责换算）
 *   3. 本地是模糊日期（AI 也搞不定）→ 留空，绝不退回那个模糊原文
 *   4. 否则用本地的
 *
 * location / audience：AI 优先，本地兜底（单值字段）。
 *
 * materials：整套用一边，绝不拼接。
 *   【为什么不拼】
 *   真实踩过坑：本地抓到 2 样、AI 抓到 3 样，如果拼接会得到 5 样，
 *   而原文里根本没有这种组合。用户会照着假清单去准备。
 *   所以：AI 给了非空数组就用 AI（AI 能列白名单外的物品，比如“黑色笔”），
 *   否则整套退回本地。
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