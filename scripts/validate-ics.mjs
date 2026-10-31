/**
 * ICS 文件本地校验（不依赖第三方库）
 * 用法：
 *   node scripts/validate-ics.mjs <文件路径>
 *   node scripts/validate-ics.mjs --sample
 */

import { readFileSync } from "node:fs";
import { generateDeadlineICS } from "../app/lib/generateICS.js";

const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const encoder = new TextEncoder();

function validateICS(raw) {
  const errors = [];
  const warnings = [];

  // 1. CRLF 检查
  const lfCount = raw.split(LF).length - 1;
  const crlfCount = raw.split(CRLF).length - 1;
  if (crlfCount === 0) {
    errors.push("文件中没有任何 CRLF 换行，不符合 RFC 5545。");
  } else if (lfCount !== crlfCount) {
    errors.push(
      "换行不一致：共 " + lfCount + " 个 LF，其中只有 " + crlfCount +
      " 个是 CRLF。ICS 要求全部使用 CRLF。"
    );
  }

  const lines = raw.split(CRLF);

  // 2. 每行字节数（RFC 5545：每行最多 75 字节）
  for (let i = 0; i < lines.length; i++) {
    const bytes = encoder.encode(lines[i]).length;
    if (bytes > 75) {
      const preview =
        lines[i].length > 20 ? lines[i].slice(0, 20) + "…" : lines[i];
      errors.push(
        "第 " + (i + 1) + " 行超过 75 字节（" + bytes + " 字节）：" + preview
      );
    }
  }

  // 3. 行尾多余空白
  for (let i = 0; i < lines.length; i++) {
    if (/[ ]+$/.test(lines[i])) {
      warnings.push("第 " + (i + 1) + " 行末尾有空格，建议去掉。");
    }
  }

  // 4. 折行续行一致性：如果某行以空格/tab 开头，上一行必须是它的逻辑前驱
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(" ") || line.startsWith(String.fromCharCode(9))) {
      if (line.length === 1) {
        warnings.push("第 " + (i + 1) + " 行只有折行前缀空格，没有内容。");
      }
    }
  }

  // 5. 组件配对
  const stack = [];
  const known = [
    "VCALENDAR", "VTIMEZONE", "STANDARD", "DAYLIGHT",
    "VEVENT", "VTODO", "VALARM",
  ];
  for (const line of lines) {
    if (line.startsWith("BEGIN:")) {
      const name = line.slice(6);
      if (!known.includes(name)) warnings.push("未知组件 BEGIN:" + name);
      stack.push(name);
    } else if (line.startsWith("END:")) {
      const name = line.slice(4);
      const top = stack.pop();
      if (top !== name) {
        errors.push(
          "组件不匹配：遇到 END:" + name + "，但栈顶是 " + (top || "空")
        );
      }
    }
  }
  if (stack.length > 0) {
    errors.push("以下组件未闭合：" + stack.join(", "));
  }

  // 6. 必备字段
  const text = lines.join(CRLF);
  const required = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "END:VCALENDAR",
    "BEGIN:VEVENT",
    "END:VEVENT",
    "UID:",
    "DTSTAMP:",
    "DTSTART",
  ];
  for (const key of required) {
    if (!text.includes(key)) errors.push("缺少必备字段或组件：" + key);
  }

  // 7. 事件/提醒数量
  const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
  const alarmCount = (text.match(/BEGIN:VALARM/g) || []).length;
  if (eventCount > 0 && alarmCount === 0) {
    warnings.push("没有 VALARM 提醒组件。");
  }

  // 8. DTSTART 时间格式
  const dtStartMatch = text.match(/DTSTART[^:]*:([0-9T]+)/);
  if (dtStartMatch) {
    if (!/^[0-9]{8}T[0-9]{6}$/.test(dtStartMatch[1])) {
      errors.push(
        "DTSTART 时间格式不正确：" + dtStartMatch[1] +
        "，应为 YYYYMMDDTHHMMSS。"
      );
    }
  } else {
    warnings.push("未找到 DTSTART 的日期时间值。");
  }

  return { errors, warnings };
}

function report({ errors, warnings }) {
  if (warnings.length) {
    console.log("⚠ 警告：");
    for (const w of warnings) console.log("  - " + w);
  }
  if (errors.length) {
    console.log("✗ 错误：");
    for (const e of errors) console.log("  - " + e);
    process.exitCode = 1;
  } else {
    console.log("✓ 通过基本结构检查（含每行 ≤ 75 字节）。");
    console.log(
      "  建议再用在线验证器做一次 RFC 5545 完整校验：https://icalendar.org/validator.html"
    );
  }
}

const args = process.argv.slice(2);

if (args[0] === "--sample") {
  const sample = generateDeadlineICS({
    title: "关于开展2026年秋季学期国家助学金申请材料报送工作的通知",
    deadlineDate: new Date(2026, 10, 15, 17, 0, 0, 0),
    location: "学生资助管理中心A301办公室",
    description:
      "请各学院于截止前报送《国家助学金申请表》和家庭经济困难证明复印件，含逗号、分号、反斜杠等特殊字符测试：A,B;C\\\\D。",
  });
  console.log("==== 生成的样例 ICS（行尾标记 <CRLF>） ====");
  console.log(sample.split(CRLF).join("<CRLF>" + LF));
  console.log("");
  report(validateICS(sample));
} else if (args[0]) {
  const raw = readFileSync(args[0], "utf8");
  report(validateICS(raw));
} else {
  console.log("用法：");
  console.log("  node scripts/validate-ics.mjs <文件路径>");
  console.log("  node scripts/validate-ics.mjs --sample");
}