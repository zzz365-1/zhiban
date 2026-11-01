/**
 * 客户端调用 /api/parse 的薄封装，以及 AI 结果的合并与校验。
 */

/**
 * 分类白名单。
 *
 * 【为什么要在 mergeAIResult 里拦】
 * AI 返回的 category 是不可信输入。prompt 里写了“只能是这五类之一”，
 * 但模型不保证遵守——它可能返回“球赛”“教学”“教务通知”这类原文里
 * 出现但不在白名单内的词。如果不校验，界面会原样显示，用户看不出问题。
 * 放在这里校验的原因：mergeAIResult 是 AI 结果进入系统的唯一入口。
 * 拦截点选在唯一入口，下游（页面展示、保存到 localStorage、日历）全部安全。
 * 不放在 route 里：那会造成“route 拦一次、merge 再拦一次”，两处逻辑。
 */
export const VALID_CATEGORIES = ["教务", "活动", "行政", "后勤", "其他"];

/**
 * 校验并规范化分类值。合法值保留，非法值一律返回 null（显示为“未识别”）。
 * 不做模糊匹配——“教务通知”不是“教务”，不能猜。
 */
export function normalizeCategory(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!VALID_CATEGORIES.includes(t)) return null;
  return t;
}

/**
 * 错误码 → 短标签（用于顶部小标签，字数受限）
 */
const SHORT_ERROR_LABEL = {
  no_key: "未配密钥",
  timeout: "响应超时",
  network_error: "网络异常",
  empty_content: "返回为空",
  invalid_json: "格式异常",
  bad_request: "请求异常",
  empty_text: "原文为空",
  ai_failed: "调用失败",
};

export function shortParseErrorLabel(code) {
  if (!code) return "调用失败";
  if (code in SHORT_ERROR_LABEL) return SHORT_ERROR_LABEL[code];
  if (String(code).startsWith("upstream_")) return "服务异常";
  return "调用失败";
}

/**
 * 错误码 → 完整说明（用于面板里那块提示）
 *
 * 【为什么要区分具体原因】
 * 真实踩过坑：解析失败时界面只有一句“模型未接入，已退回本地”，
 * 用户不知道是超时、网络断了、还是密钥没配。用户以为是程序坏了，
 * 以为是粘贴时丢字了，反复重试。把原因说清楚，用户才能判断
 * “是该等一会儿再试”“该检查网络”还是“该去配密钥”。
 *
 * 【为什么 no_key 的文案里同时写“密钥”和 DEEPSEEK_API_KEY】
 * 用户体验上，“密钥”这两个中文字让学生一眼就懂该去配什么；
 * 开发者排查时也需要看到 DEEPSEEK_API_KEY 这个技术名才能定位。
 * 两者缺一不可。
 */
const LONG_ERROR_TEXT = {
  no_key: "未配置模型密钥（DEEPSEEK_API_KEY），无法调用模型。",
  timeout: "模型响应超时（超过 20 秒）。可能是网络慢或服务繁忙。",
  network_error: "网络连接失败，请求没有送达模型服务。",
  empty_content: "模型返回了空内容，没有可用的解析结果。",
  invalid_json: "模型返回的内容不是合法的 JSON 格式。",
  bad_request: "发给模型的请求格式异常，通常是程序内部问题。",
  empty_text: "通知原文为空，没有可解析的内容。",
  ai_failed: "模型调用失败，具体原因未知。",
};

export function describeParseError(code) {
  if (!code) return "模型调用失败，具体原因未知。";
  if (code in LONG_ERROR_TEXT) return LONG_ERROR_TEXT[code];
  const s = String(code);
  if (s.startsWith("upstream_")) {
    return "模型服务返回异常状态码 " + s.slice("upstream_".length) + "。";
  }
  return "模型调用失败，具体原因未知。";
}

/**
 * 调用 /api/parse。
 * 失败时抛出的 Error 带 .code 字段，供上层区分具体原因。
 */
export async function callAIExtract(text) {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = new Error("HTTP " + res.status);
    err.code = "network_error";
    throw err;
  }

  const data = await res.json();

  if (!data?.ok || !data?.result) {
    const code = data?.error || "ai_failed";
    const err = new Error(data?.message || code);
    err.code = code;
    throw err;
  }

  return data.result;
}

/**
 * 周几前缀正则。跟 relativeDate.js 的 WEEK_PREFIX_RE 完全一致。
 *
 * 【为什么必须和 relativeDate.js 一模一样】
 * 这个正则决定 isFuzzyDate 认不认“这个星期三”“下个星期三”这些说法。
 * isFuzzyDate 返回 true 才会触发本地换算（parseOne 里）；返回 false 就
 * 交给 AI 兜底。上一轮我把它简化成 (下一周|下个星期|这个星期|这个周|本|这|下)?，
 * 结果“这个星期三”的前缀“这个星期”把“星期”吃进去，剩下“三”，
 * 后面 (周|星期) 匹配不上，isFuzzyDate 返回 false，本地不算，又退回 AI。
 * 用户明确说“模型算日子偶尔会差一天，差了还看不出来”，不能再交回 AI。
 * 所以两边必须共享同一份前缀定义，不能各自维护一份“差不多”的。
 */
const WEEK_PREFIX_RE =
  "(?:下下个星期|下下个|下下|下一个|下个星期|这个星期|这一个星期|下一个|本星期|下一周|下个|这个|这一个|本周|下|本|这)?";

const FUZZY_DATE_PATTERNS = [
  new RegExp("^(今天|明天|后天|大后天|次日|隔天|即日)$"),
  new RegExp("^" + WEEK_PREFIX_RE + "(周|星期)[一二三四五六日天]$"),
  new RegExp("^(本月|下月)?(底|初|末)$"),
  new RegExp("^[0-9]{1,2}月(底|初|末)$"),
  new RegExp("^(本月|下月)[0-9]{1,2}[日号]$"),
  new RegExp(
    "^(?:过[0-9一二三四五六七八九十两]+(?:天|日|周|个星期|个月|年)|[0-9一二三四五六七八九十两]+(?:天|日|周|个?星期|个月|年)(?:之内|以内|内|之后|以后|后))$"
  ),
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
 * category：必须经过白名单校验，非法值一律变 null。
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
    category: normalizeCategory(aiResult.category),
    _source: "mixed",
    _inferredDeadline: inferred,
  };
}