/**
 * 相对日期 + 具体日期 断言测试
 * 直接调用 DeepSeek API，提示词与线上共用 app/lib/parsePrompt.js
 * 用法：node scripts/test-relative-dates.mjs
 */

import { readFileSync } from "node:fs";
import { buildMessages } from "../app/lib/parsePrompt.js";

const LF = String.fromCharCode(10);

// ---------- 读取 .env.local ----------

function loadEnv() {
  try {
    const content = readFileSync(".env.local", "utf8");
    for (const line of content.split(LF)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    console.warn("未找到 .env.local，AI 调用会失败。");
  }
}

loadEnv();
const API_KEY = process.env.DEEPSEEK_API_KEY;

// ---------- 日期工具 ----------

function formatCN(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function nextWeekday(today, target) {
  const d = new Date(today);
  const cur = d.getDay();
  let delta = target - cur;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function normalizeDate(s) {
  if (!s) return null;
  const m = String(s).match(
    /([0-9]{4})[^0-9]*([0-9]{1,2})[^0-9]*([0-9]{1,2})/
  );
  if (!m) return null;
  return (
    m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0")
  );
}

// ---------- 调用 API ----------

async function callAI(text) {
  if (!API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + API_KEY,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        stream: false,
        thinking: { type: "disabled" },
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: buildMessages(text),
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + ": " + detail.slice(0, 150));
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || !content.trim()) throw new Error("空返回");
    return JSON.parse(content);
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ---------- 测试用例 ----------
// expected 是一个函数 (today) => "YYYY年M月D日" | null
// 用函数是为了不把日期写死，任何一天跑都成立。

const CASES = [
  {
    name: "明天",
    text: "请于明天中午12点前将名单报送至教务处A301办公室。",
    expected: (today) => formatCN(addDays(today, 1)),
  },
  {
    name: "本周五（今天已过周五）",
    text: "请于本周五前到宿舍管理中心值班室登记领取。",
    expected: (today) => formatCN(nextWeekday(today, 5)),
  },
  {
    name: "本月25日（今天已过25日）",
    text: "请欠费同学务必于本月25日前完成缴费。",
    expected: (today) =>
      today.getDate() <= 25
        ? formatCN(new Date(today.getFullYear(), today.getMonth(), 25))
        : null,
  },
  {
    name: "下周三",
    text: "学校定于下周三下午3点在就业指导中心会议室召开就业推进会。",
    expected: (today) => formatCN(nextWeekday(today, 3)),
  },
  {
    name: "大后天",
    text: "请于大后天上午10点前将材料提交至行政楼A208办公室。",
    expected: (today) => formatCN(addDays(today, 3)),
  },
  {
    name: "消防演练（多个日期，取截止）",
    text: `关于组织开展2026年秋季校园消防安全演练的通知
一、演练时间：2026年11月2日15:00
二、集合地点：图书馆南广场
请各班班长于当日12:00前将本班参会名单报送至辅导员处。`,
    expected: () => "2026年11月2日",
  },
  {
    name: "图像采集（具体日期）",
    text: "毕业生学历图像信息采集定于2026年11月20日上午8:30在大学生活动中心一层大厅进行。",
    expected: () => "2026年11月20日",
  },
  {
    name: "新生复查（具体日期）",
    text: "请各学院于2026年11月12日17:00前将汇总表报送至行政楼A208学籍管理办公室。",
    expected: () => "2026年11月12日",
  },
  {
    name: "读书月（活动 11-08，截止 11-06）",
    text: "图书馆定于2026年11月8日9:00在图书馆一楼多功能厅举办读书月开幕式。请有意参加的同学以班级为单位填写登记表，由班长统一于2026年11月6日12:00前发至邮箱。",
    expected: () => "2026年11月6日",
  },
  {
    name: "自习室（无截止日期）",
    text: "为配合冬季用电管理，三楼自习室开放时间自即日起调整为每日8:00至22:30。",
    expected: () => null,
  },
  {
    name: "创新创业（活动 11-28，截止 11-25）",
    text: "学校定于2026年11月28日14:00在大学生创新创业中心二楼报告厅举行中期答辩。各项目组须于2026年11月25日17:00前提交中期进展报告。",
    expected: () => "2026年11月25日",
  },
  {
    name: "马拉松（活动 11-30，截止 11-27）",
    text: "校工会定于2026年11月30日上午在东体育场举行第七届校园马拉松。请各单位于2026年11月27日前将参赛名单汇总报送至体育部。",
    expected: () => "2026年11月27日",
  },
  {
    name: "防寒物资（本周五）",
    text: "请各宿舍长于本周五前到宿舍管理中心值班室登记领取。",
    expected: (today) => formatCN(nextWeekday(today, 5)),
  },
  {
    name: "就业推进会（下周三）",
    text: "学校定于下周三下午3点在就业指导中心会议室召开就业推进会。",
    expected: (today) => formatCN(nextWeekday(today, 3)),
  },
  {
    name: "宿舍隐患（本月底）",
    text: "请各楼栋长于本月底前完成自查，并将排查结果表报送至保卫处值班室。",
    expected: (today) =>
      formatCN(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  },
  {
    name: "催缴学费（本月25日）",
    text: "请欠费同学务必于本月25日前完成缴费，逾期将影响选课。",
    expected: (today) =>
      today.getDate() <= 25
        ? formatCN(new Date(today.getFullYear(), today.getMonth(), 25))
        : null,
  },
  {
    name: "今天",
    text: "请于今天下午5点前将表格交至行政楼101室。",
    expected: (today) => formatCN(today),
  },
  {
    name: "下周一",
    text: "请于下周一上午9点前提交电子版至邮箱。",
    expected: (today) => formatCN(nextWeekday(today, 1)),
  },
];

// ---------- 主流程 ----------

async function main() {
  const today = new Date();
  console.log("今天：" + formatCN(today) + "（周" + "日一二三四五六"[today.getDay()] + "）");
  console.log("");

  if (!API_KEY) {
    console.log("✗ 缺少 DEEPSEEK_API_KEY，无法测试。");
    process.exitCode = 1;
    return;
  }

  let pass = 0;
  let fail = 0;

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const expectedRaw = c.expected(today);
    const expectedNorm = normalizeDate(expectedRaw);

    let actualRaw = null;
    let errorMsg = null;

    try {
      const ai = await callAI(c.text);
      actualRaw = ai.deadline || null;
    } catch (e) {
      errorMsg = e.message;
    }

    const actualNorm = normalizeDate(actualRaw);
    const ok = !errorMsg && actualNorm === expectedNorm;

    if (ok) pass++;
    else fail++;

    console.log("[" + (i + 1) + "/" + CASES.length + "] " + (ok ? "✓ " : "✗ ") + c.name);
    console.log("    期望：" + (expectedRaw || "(空)"));
    console.log("    实际：" + (errorMsg ? "调用失败：" + errorMsg : actualRaw || "(空)"));
    if (!ok && !errorMsg) {
      const snippet = c.text.slice(0, 60).split(LF).join(" ");
      console.log("    原文：" + snippet + " …");
    }
    console.log("");
  }

  console.log("结果：" + pass + " 通过 / " + fail + " 失败 / 共 " + CASES.length + " 条");

  if (fail > 0) {
    process.exitCode = 1;
  }
}

main();