/**
 * 客户端调用 /api/parse 的薄封装，以及 AI 结果的合并、校验、出处核对。
 */

import {
  groundStringValue,
  groundDateValue,
} from "./grounding.js";

export const VALID_CATEGORIES = ["教务", "活动", "行政", "后勤", "其他"];

export function normalizeCategory(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!VALID_CATEGORIES.includes(t)) return null;
  return t;
}

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
 * 合并 AI 结果，并做出处核对。
 *
 * 【日期和时间必须同源】
 * 一条通知里有两个日期时，本地抓到的“时间”可能是活动开始时间，
 * 而 AI 补上的是截止日期，两者拼起来会得到原文里不存在的时刻。
 * 所以 deadline 和 time 作为一组不可拆字段，同来源同取舍。
 *
 * 【出处核对：只核对“应该从原文抄”的字段】
 * - deadline / time / location / materials / audience：核对
 * - title / summary / category：不核对（模型组织出来的）
 * - 本地已换算的 deadline（_locallyResolved）：直接放行
 * - 时间如果跟着 deadline 被拦，一起拦（日期时间同源）
 *
 * 【核对失败的处理】
 * - location / time / materials：清空该值，记入 _groundingDropped
 * - audience：退回本地值（如果有），否则清空并记录
 * - deadline：清空，同时清空 time（日期时间同源）
 *
 * 【sourceText 参数】
 * 生产环境必须传原文。传 undefined 时跳过核对（向后兼容老测试），
 * 但实际调用点（parseOne）必须传 text。
 */
export function mergeAIResult(ruleResult, aiResult, sourceText) {
  const base = ruleResult || {};
  const skipGrounding = sourceText === undefined;

  const baseDeadlineIsResolved =
    Boolean(base._locallyResolved) && Boolean(base.deadline);
  const baseDeadlineIsFuzzy =
    Boolean(base.deadline) && isFuzzyDate(base.deadline);

  // ---- 第一步：字段来源选择（原有逻辑） ----
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

  let location = aiResult.location || base.location || null;
  let audience = aiResult.audience || base.audience || null;

  const title = aiResult.title || null;
  const summary = aiResult.summary || null;
  const category = normalizeCategory(aiResult.category);

  // ---- 第二步：出处核对 ----
  if (skipGrounding) {
    return {
      deadline,
      time,
      location,
      materials,
      audience,
      title,
      summary,
      category,
      _source: "mixed",
      _inferredDeadline: inferred,
      _groundingSkipped: true,
      _groundingPositions: {},
      _groundingDropped: [],
    };
  }

  const positions = {};
  const dropped = [];

  // deadline：本地已换算的直接放行，不核对
  let finalDeadline = deadline;
  let finalTime = time;

  if (!baseDeadlineIsResolved && finalDeadline) {
    const g = groundDateValue(finalDeadline, sourceText);
    if (g.accepted) {
      if (g.position) positions.deadline = g.position;
      // deadline 通过 → time 单独核对
      if (finalTime) {
        const gt = groundStringValue(finalTime, sourceText);
        if (gt.accepted) {
          if (gt.position) positions.time = gt.position;
        } else {
          dropped.push({
            field: "time",
            value: finalTime,
            reason: gt.reason,
          });
          finalTime = null;
        }
      }
    } else {
      dropped.push({
        field: "deadline",
        value: finalDeadline,
        reason: g.reason,
      });
      if (finalTime) {
        dropped.push({
          field: "time",
          value: finalTime,
          reason: "日期被拦，时间一起拦",
        });
      }
      finalDeadline = null;
      finalTime = null;
    }
  }

  // location
  let finalLocation = location;
  if (finalLocation) {
    const g = groundStringValue(finalLocation, sourceText);
    if (g.accepted) {
      if (g.position) positions.location = g.position;
    } else {
      dropped.push({
        field: "location",
        value: finalLocation,
        reason: g.reason,
      });
      // 退回本地值（本地值来自原文抽取，通常能找到）
      finalLocation = base.location || null;
      if (finalLocation) {
        const g2 = groundStringValue(finalLocation, sourceText);
        if (!g2.accepted) {
          dropped.push({
            field: "location",
            value: finalLocation,
            reason: "本地值也找不到出处，清空",
          });
          finalLocation = null;
        } else if (g2.position) {
          positions.location = g2.position;
        }
      }
    }
  }

  // materials：逐个核对
  const finalMaterials = [];
  for (const m of materials) {
    const g = groundStringValue(m, sourceText);
    if (g.accepted) {
      finalMaterials.push(m);
      if (g.position) {
        if (!positions.materials) positions.materials = [];
        positions.materials.push(g.position);
      }
    } else {
      dropped.push({ field: "materials", value: m, reason: g.reason });
    }
  }

  // audience：宽松处理
  let finalAudience = audience;
  if (audience) {
    const g = groundStringValue(audience, sourceText);
    if (g.accepted) {
      if (g.position) positions.audience = g.position;
    } else if (base.audience && base.audience !== audience) {
      dropped.push({
        field: "audience",
        value: audience,
        reason: "AI 值找不到出处，退回本地值",
      });
      finalAudience = base.audience;
    } else {
      dropped.push({ field: "audience", value: audience, reason: g.reason });
      finalAudience = null;
    }
  }

  return {
    deadline: finalDeadline,
    time: finalTime,
    location: finalLocation,
    materials: finalMaterials,
    audience: finalAudience,
    title,
    summary,
    category,
    _source: "mixed",
    _inferredDeadline: inferred,
    _groundingPositions: positions,
    _groundingDropped: dropped,
  };
}