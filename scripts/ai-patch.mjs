/**
 * 开发流程辅助脚本：把本地文件与提示词发给对话式 AI，拿回改动建议
 *
 * 用法：
 *   node scripts/ai-patch.mjs --files 文件1 文件2 --prompt 提示词文件 --out 输出文件
 *
 * 定位：本脚本只负责搬运与记录，不生成任何业务代码。
 * 代码内容始终由对话式 AI 产出，本脚本把它的回复原样落盘供人工审阅。
 *
 * 安全约定（与 check-api-key.mjs 一致）：
 *   - 任何情况下都不打印完整的 Key
 *   - 输出文件默认写在 .ai-out.md，已加入 .gitignore，不会进仓库
 *
 * 关于输出为空：本项目实测过，max_tokens 给得太小时模型会先把额度用在内部思考上，
 * 表现为返回空字符串且不报错。因此这里默认给足，并在结尾打印 token 用量与正文长度，
 * 便于判断是不是又踩了这个坑。
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- 解析参数 ----------
function parseArgs(argv) {
  const args = { files: [], prompt: null, out: ".ai-out.md", facts: null, maxTokens: 2048, model: "deepseek-flash", reply: null, thread: null };
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--files") {
      i++;
      while (i < argv.length && !argv[i].startsWith("--")) args.files.push(argv[i++]);
    } else if (a === "--prompt") {
      args.prompt = argv[++i];
      i++;
    } else if (a === "--out") {
      args.out = argv[++i];
      i++;
    } else if (a === "--facts") {
      args.facts = argv[++i];
      i++;
    } else if (a === "--max-tokens") {
      args.maxTokens = Number(argv[++i]);
      i++;
    } else if (a === "--model") {
      args.model = argv[++i];
      i++;
    } else if (a === "--reply") {
      args.reply = argv[++i];
      i++;
    } else if (a === "--thread") {
      args.thread = argv[++i];
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "用法: node scripts/ai-patch.mjs --files 文件1 [文件2...] --prompt 提示词.md [--facts 事实.md] [--out 输出.md]"
      );
      process.exit(0);
    } else {
      console.error("无法识别的参数: " + a);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const threadAbs = args.thread ? join(root, args.thread) : null;
let messages = null;

// 已有会话文件则续接，这样能形成真实的往返链
if (threadAbs && existsSync(threadAbs)) {
  messages = JSON.parse(readFileSync(threadAbs, "utf8"));
  console.log("已加载会话记录，共 " + messages.length + " 条消息");
}

const continuing = messages !== null;

if (!continuing && (!args.prompt || args.files.length === 0)) {
  console.error("缺少参数。首次调用需要 --files 至少一个文件，以及 --prompt 一个提示词文件");
  console.error("示例: node scripts/ai-patch.mjs --files app/lib/relativeDate.js --prompt prompts/019h-relative-test-coverage.md");
  console.error("续接会话用 --thread 会话文件 --reply 回复文件");
  process.exit(1);
}

// ---------- 读取密钥 ----------
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("未找到 .env.local");
  process.exit(1);
}
const envText = readFileSync(envPath, "utf8");
const matched = envText.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/m);
if (!matched) {
  console.error(".env.local 中没有找到 DEEPSEEK_API_KEY 这一行");
  process.exit(1);
}
const apiKey = matched[1];
if (!/^sk-[A-Za-z0-9]+$/.test(apiKey)) {
  console.error("Key 格式不对，应以 sk- 开头");
  process.exit(1);
}
console.log("密钥读取成功（前缀 " + apiKey.slice(0, 5) + "，完整值不打印）");

// ---------- 提取提示词正文（按 ## Prompt 标题定位，不按代码块序号） ----------
let promptText = "";
let context = "";
let factsText = "";

if (!continuing) {
const promptRaw = readFileSync(join(root, args.prompt), "utf8");
const titleIdx = promptRaw.indexOf("## Prompt");
if (titleIdx < 0) {
  console.error("提示词文件里没有找到 ## Prompt 标题，无法定位正文");
  process.exit(1);
}
const afterTitle = promptRaw.slice(titleIdx);
const blockMatch = afterTitle.match(/```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```/);
if (!blockMatch) {
  console.error("## Prompt 标题后面没有找到代码块");
  process.exit(1);
}
const promptText = blockMatch[1];
console.log("提示词正文 " + promptText.length + " 字（按标题定位，非按序号取块）");

// ---------- 组装上下文 ----------
let context = "";
for (const rel of args.files) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.error("找不到文件: " + rel);
    process.exit(1);
  }
  const body = readFileSync(abs, "utf8");
  context += "\n\n===== 文件: " + rel + " （共 " + body.split(/\r?\n/).length + " 行）=====\n" + body;
}
console.log("上下文合计 " + context.length + " 字，来自 " + args.files.length + " 个文件");

// ---------- 附加本机已核验的事实（避免模型自己另算导致期望值出错） ----------
let factsText = "";
if (args.facts) {
  const factsAbs = join(root, args.facts);
  if (!existsSync(factsAbs)) {
    console.error("找不到事实文件: " + args.facts);
    process.exit(1);
  }
  const f = readFileSync(factsAbs, "utf8");
  factsText =
    "\n\n===== 本机实跑核验过的期望值（请照此写，不要自己另算）=====\n" + f;
  console.log("附加已核验事实 " + f.length + " 字");
}
}

// ---------- 调用 ----------
const BASE = "https://api.deepseek.com";
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

const systemMsg =
  "你是一名协助开发的高校学生项目的对话式 AI。" +
  "用户会把项目文件原文和需求一起发给你。" +
  "请严格遵守用户在需求里提出的每一条约束，尤其是只输出改动片段、不要整体重写文件这一条。" +
  "如果不确定，直接提问，不要臆测项目结构。";

let msgs;
if (continuing) {
  msgs = messages;
  if (args.reply) {
    const replyAbs = join(root, args.reply);
    if (!existsSync(replyAbs)) {
      console.error("找不到回复文件: " + args.reply);
      process.exit(1);
    }
    const replyText = readFileSync(replyAbs, "utf8");
    msgs.push({ role: "user", content: replyText });
    console.log("追加本轮回复 " + replyText.length + " 字");
  } else {
    console.error("续接会话时必须用 --reply 指定回复内容文件");
    process.exit(1);
  }
} else {
  const userMsg =
    "下面是本项目相关文件的当前内容。" +
    context +
    factsText +
    "\n\n===== 我这次的需求 =====\n" +
    promptText;
  msgs = [
    { role: "system", content: systemMsg },
    { role: "user", content: userMsg },
  ];
}

console.log("");
console.log("正在调用，请稍候（共 " + msgs.length + " 条消息）...");
const started = Date.now();

let response;
try {
  response = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: msgs,
      max_tokens: args.maxTokens,
      stream: false,
    }),
  }).then((r) => r.json());
} catch (e) {
  console.error("调用失败: " + e.message);
  process.exit(1);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (response.error) {
  console.error("接口返回错误: " + response.error.message);
  process.exit(1);
}

const message = (response.choices ?? [{}])[0].message ?? {};
const usage = response.usage ?? {};
const detail = usage.completion_tokens_details ?? {};
const content = message.content || "";

console.log("耗时 " + elapsed + " 秒");
console.log("token 消耗：输入 " + usage.prompt_tokens + " / 输出 " + usage.completion_tokens);
console.log("其中思考占用 " + (detail.reasoning_tokens ?? 0) + " tokens");
console.log("返回正文长度 " + content.length + " 字");

if (!content.trim()) {
  console.error("");
  console.error("返回正文为空，且思考占用 " + (detail.reasoning_tokens ?? 0) + " tokens。");
  console.error("本项目实测：输出预算给得越大，模型越容易把额度全花在内部思考上，");
  console.error("导致正文一个字都出不来，而且不报错（静默失败）。");
  console.error("生产代码 app/api/parse/route.js 用的是 1024，能正常返回。");
  console.error("建议加 --max-tokens 1024 或更小重试，当前用的是 " + args.maxTokens + "。");
  process.exit(1);
}

const outAbs = join(root, args.out);
writeFileSync(outAbs, content, "utf8");

// 保存会话，便于下一轮续接形成真实往返链
if (threadAbs) {
  msgs.push({ role: "assistant", content });
  writeFileSync(threadAbs, JSON.stringify(msgs, null, 2), "utf8");
  console.log("会话已保存到 " + args.thread + "，共 " + msgs.length + " 条消息");
} else {
  console.log("提示：未指定 --thread，本轮会话未保存，下次无法续接");
}

console.log("");
console.log("已写入 " + args.out + " （待审文件，不直接覆盖生产代码）");
console.log("请人工审阅后再决定是否应用。");
