/**
 * 界面验证工具：驱动本机 Edge 走一遍真实页面并截图。
 *
 * 【为什么要有它】
 * 单元测试只能验纯逻辑，界面上到底长什么样、按钮点了有没有反应，
 * 光看代码永远不知道。这个脚本用 CDP 打开页面，执行一段注入脚本，
 * 再把画面截下来，让界面改动也能自己验收，不用全交给用户判断。
 *
 * 用法：
 *   node scripts/ui-shot.mjs <输出png> [@交互脚本.js]
 *   不带交互脚本时只截首屏。
 *
 * 依赖：本机装了 Edge。找不到就提示，不假装跑过。
 */

import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const PORT = 9333;
const URL = "http://localhost:3000/";

const out = process.argv[2] || "zhiban-ui.png";
const scriptArg = process.argv[3] || "";

const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) {
  console.log("本机没找到 Edge，截不了图。请人工在浏览器里确认。");
  process.exit(2);
}

const script = scriptArg.startsWith("@")
  ? readFileSync(scriptArg.slice(1), "utf8")
  : scriptArg;

const dir = mkdtempSync(join(tmpdir(), "zbedge"));
const proc = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--window-size=1600,900",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + dir,
  URL,
]);

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const target = await waitFor(async () => {
  const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
  const j = await r.json();
  return j.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
}, 20000);

if (!target) {
  console.log("没连上页面，开发服务器起来了吗？");
  proc.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

function send(method, params) {
  id++;
  const p = new Promise((res) => pending.set(id, res));
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return p;
}

await send("Page.enable");
await send("Runtime.enable");
await new Promise((r) => setTimeout(r, 2500));

if (script) {
  const r = await send("Runtime.evaluate", {
    expression: script,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log("脚本返回：" + JSON.stringify(r.result?.result?.value));
  await new Promise((r2) => setTimeout(r2, 1200));
}

const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data) {
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("截图写入 " + out);
} else {
  console.log("截图失败");
}

ws.close();
proc.kill();
process.exit(0);
