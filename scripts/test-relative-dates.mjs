/**
 * 相对日期换算测试
 * 直接调用 DeepSeek API，不经过本地服务器。
 * 用法：node scripts/test-relative-dates.mjs
 */

import { readFileSync } from "node:fs";
import { extractNotice } from "../app/lib/extractNotice.js";
import { buildDeadlineDate } from "../app/lib/deadline.js";

const LF = String.fromCharCode(10);

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

function buildPrompt() {
  const today = new Date();
  const todayStr =
    today.getFullYear() +
    "年" +
    (today.getMonth() + 1) +
    "月" +
    today.getDate() +
    "日";

  return `你是校园通知信息提取器。输出 json，不要输出其他内容。

今天的日期是 ${todayStr}。相对日期必须以今天为基准换算成具体日期，格式“YYYY年M月D日”。算不出来就填 null，不要编造。

字段：title, deadline, time, location, summary, category。
deadline 和 time 分开，time 用 24 小时制 HH:MM。`;
}

async function callAI(text) {
  if (!API_KEY) throw new Error("缺少 DEEPSEEK_API_KEY");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
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
      messages: [
        { role: "system", content: buildPrompt() },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("HTTP " + res.status + ": " + detail.slice(0, 200));
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("空返回");
  return JSON.parse(content);
}

const CASES = [
  {
    name: "明天",
    text: "请于明天中午12点前将名单报送至教务处A301办公室。",
  },
  {
    name: "本周五",
    text: "请于本周五前到宿舍管理中心值班室登记领取。",
  },
  {
    name: "本月25日",
    text: "请于本月25日前完成缴费。",
  },
  {
    name: "下周三",
    text: "学校定于下周三下午3点在就业指导中心会议室召开就业推进会。",
  },
  {
    name: "大后天",
    text: "请于大后天上午10点前将材料提交至行政楼A208办公室。",
  },
];

const today = new Date();
console.log(
  "今天：" +
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0")
);
console.log("");

for (const c of CASES) {
  console.log("==== " + c.name + " ====");
  console.log("原文：" + c.text);

  const rule = extractNotice(c.text);
  console.log("本地 deadline：" + (rule.deadline || "(空)"));
  console.log("本地 time：" + (rule.time || "(空)"));

  try {
    const ai = await callAI(c.text);
    console.log("AI deadline：" + (ai.deadline || "(空)"));
    console.log("AI time：" + (ai.time || "(空)"));

    const mergedDeadline = ai.deadline || rule.deadline;
    const mergedTime = ai.deadline ? ai.time || null : rule.time || null;
    const date = buildDeadlineDate(mergedDeadline, mergedTime);

    if (date) {
      console.log(
        "最终日期：" +
          date.getFullYear() +
          "-" +
          String(date.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(date.getDate()).padStart(2, "0") +
          " " +
          String(date.getHours()).padStart(2, "0") +
          ":" +
          String(date.getMinutes()).padStart(2, "0")
      );
    } else {
      console.log("最终日期：(无法计算)");
    }
  } catch (e) {
    console.log("AI 调用失败：" + e.message);
  }

  console.log("");
}

console.log("测试完成。");