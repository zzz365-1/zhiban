/**
 * 正则规矩检查（CLI）
 * 用法：node scripts/check-regex.mjs
 *
 * 扫描 app/lib/ 下的所有 .js 文件，检查代码部分（跳过注释）
 * 有没有违规的反斜杠转义。
 *
 * 用绝对路径定位项目根，无论从哪跑都能找到 app/lib。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintRegexCode } from "../app/lib/regexLint.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const LIB_DIR = resolve(PROJECT_ROOT, "app", "lib");

const files = readdirSync(LIB_DIR).filter((f) => f.endsWith(".js"));

let totalIssues = 0;
let cleanFiles = 0;

for (const file of files) {
  const source = readFileSync(join(LIB_DIR, file), "utf8");
  const issues = lintRegexCode(source);

  if (issues.length === 0) {
    cleanFiles++;
  } else {
    console.log("✗ " + file);
    for (const i of issues) {
      console.log(
        "    第 " + i.line + " 行 — " + i.rule + "（" + i.suggestion + "）"
      );
      console.log("      " + i.snippet);
    }
    totalIssues += issues.length;
  }
}

console.log("");
console.log(
  "扫描：" + files.length + " 个文件，干净：" + cleanFiles + " 个，违规：" +
    totalIssues + " 处"
);

if (totalIssues === 0) {
  console.log("✓ 未发现违反正则规矩的代码");
} else {
  process.exitCode = 1;
}