/**
 * 解析单条通知的纯逻辑，不碰 React state。
 *
 * 【本地优先，模型兜底】
 * 先走本地规则和本地相对日期换算，本地能搞定就不调 AI。
 * 只有本地搞不定（deadline 换算失败、location 缺失）才调 AI。
 * 这样大部分校园通知不花钱，模型只负责它真正擅长的部分。
 *
 * 日期策略：
 *   1. 本地规则抽出 deadline
 *   2. 如果 deadline 是相对日期，本地尝试换算成具体日期
 *   3. 换算成功 → 不调 AI（前提 location 也有）
 *   4. 换算失败或 location 缺失 → 调 AI 兜底
 *   5. AI 返回的 deadline 如果仍是相对日期，本地再尝试换算一次
 *   6. AI 不可用时退回 rule_fallback，此时 deadline 已是本地换算结果
 *
 * 【错误码不吞掉】
 * AI 调用失败时，把错误码写进 analysis._aiErrorCode，
 * 供界面区分“超时 / 网络 / 没密钥 / 返回格式异常”等具体原因。
 * 绝不把错误码吞掉或改成模糊的一句话——用户需要知道栽在哪一步。
 *
 * 出处核对策略：
 *   AI 结果合并时把原文传进 mergeAIResult，模型返回的每个值
 *   都会回原文核对出处。找不到的值会被去掉，记录在 _groundingDropped。
 *   本地已换算的日期（_locallyResolved）直接放行，不核对。
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
import { resolveRelativeDate, normalizeChineseDate } from "./relativeDate.js";
import { buildItems } from "./noticeItems.js";

export async function parseOne(text, options) {
  const opt = options || {};
  const publishedAt = opt.publishedAt ? new Date(opt.publishedAt) : null;
  const now = new Date();
  // 中文数字写的日期先换成阿拉伯数字，本地规则和模型才认得。
  // 只影响抽取用的文本，界面上展示给用户的原文不动。
  const workText = normalizeChineseDate(text);
  const ruleResult = extractNotice(workText);

  // 相对日期必须有基准。给了发布日期就按发布日期算，
  // 没给就挂起标待确认，不许默默按今天算，用户会被一个假日期带偏。
  if (ruleResult.deadline && isFuzzyDate(ruleResult.deadline)) {
    if (publishedAt) {
      const resolved = resolveRelativeDate(ruleResult.deadline, publishedAt);
      if (resolved) {
        ruleResult.deadline = resolved.normalized;
        ruleResult._locallyResolved = true;
        ruleResult._datePending = false;
      } else {
        ruleResult._datePending = true;
      }
    } else {
      ruleResult._datePending = true;
    }
  }

  // 活动日期同样本地换算。
  // 换不出来就原样留着，不因为活动日期模糊就去调模型，
  // 调不调模型只看截止日期和地点，这条判断不能改。
  if (ruleResult.eventDate && isFuzzyDate(ruleResult.eventDate)) {
    const resolvedEvent = resolveRelativeDate(ruleResult.eventDate, now);
    if (resolvedEvent) {
      ruleResult.eventDate = resolvedEvent.normalized;
    }
  }

  if (isRuleResultGood(ruleResult)) {
    const analysis = { ...ruleResult, _source: "rule" };
    return {
      analysis,
      items: buildItems(text, { publishedAt }),
    };
  }

  try {
    const aiResult = await callAIExtract(workText);
    const merged = mergeAIResult(ruleResult, aiResult, workText);

    // AI 返回的 deadline 如果仍是相对日期，同样按发布日期换算，没基准就挂起
    if (merged.deadline && isFuzzyDate(merged.deadline)) {
      if (publishedAt) {
        const resolved = resolveRelativeDate(merged.deadline, publishedAt);
        if (resolved) {
          merged.deadline = resolved.normalized;
          merged._locallyResolved = true;
          merged._inferredDeadline = false;
          merged._datePending = false;
        } else {
          merged._datePending = true;
        }
      } else {
        merged._datePending = true;
      }
    }

    return {
      analysis: merged,
      items: buildItems(text, { publishedAt }),
    };
  } catch (e) {
    const code = e?.code || "ai_failed";
    const message = String(e?.message || e);
    return {
      analysis: {
        ...ruleResult,
        _source: "rule_fallback",
        _aiErrorCode: code,
        _aiErrorMessage: message,
      },
      items: buildItems(text, { publishedAt }),
      error: { code, message },
    };
  }
}