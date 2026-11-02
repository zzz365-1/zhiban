// 016 字段溯源定位逻辑的测试。
// 用 Node 内置 assert，不需要任何依赖，也不需要网络。
// 运行：node scripts/test-locate.mjs
import assert from "node:assert/strict";
import { findSpan } from "../app/lib/fieldLocate.js";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, message: err.message });
  }
}

// 1. 一模一样能找到
test("值在原文中完全一致时返回位置", () => {
  const text = "请于明日在图书馆六楼集合。";
  const span = findSpan(text, { key: "location" }, { location: "图书馆六楼" });
  assert.ok(span, "应当找到位置");
  assert.equal(text.slice(span.start, span.end), "图书馆六楼");
});

// 2. 差一个字算找到
test("值与原文差一个字时仍算找到", () => {
  const text = "请于明日在图书馆六楼集合。";
  const span = findSpan(text, { key: "location" }, { location: "图书馆六层" });
  assert.ok(span, "差一个字也应找到位置");
  assert.equal(text.slice(span.start, span.end), "图书馆六楼");
});

// 3. 完全找不到必须返回 null（最关键）
test("原文完全不含该值时返回 null", () => {
  const text = "请于明日在图书馆六楼集合。";
  const span = findSpan(text, { key: "location" }, {
    location: "学生活动中心",
  });
  assert.equal(span, null);
});

// 4. 程序换算出来的日期必须返回 null
test("换算日期（_inferredDeadline）返回 null", () => {
  const text = "请于下周三前提交材料。";
  const span = findSpan(
    text,
    { key: "deadline" },
    { deadline: "2026-11-11", _inferredDeadline: true }
  );
  assert.equal(span, null);
});

// 5. 空字段返回 null
test("字段值为空时返回 null", () => {
  const text = "请于明日在图书馆六楼集合。";
  assert.equal(findSpan(text, { key: "location" }, { location: "" }), null);
  assert.equal(findSpan(text, { key: "location" }, {}), null);
});

// 6. 数组字段：每个都要找到，否则 null
test("材料全部都能找到时返回覆盖位置", () => {
  const text = "需提交报名表、学生证、一寸照片。";
  const span = findSpan(text, { key: "materials" }, {
    materials: ["报名表", "学生证"],
  });
  assert.ok(span, "两个材料都能找到");
  assert.equal(text.charAt(span.start), "报");
  assert.ok(span.end > span.start);
});

test("材料中有一个找不到时返回 null", () => {
  const text = "需提交报名表、学生证、一寸照片。";
  const span = findSpan(text, { key: "materials" }, {
    materials: ["报名表", "推荐信"],
  });
  assert.equal(span, null);
});

test("材料数组为空时返回 null", () => {
  const text = "需提交报名表。";
  assert.equal(findSpan(text, { key: "materials" }, { materials: [] }), null);
});

if (failures.length === 0) {
  console.log("全部通过：" + passed + " 项");
} else {
  for (const f of failures) {
    console.log("FAIL " + f.name + "\n      " + f.message);
  }
  console.log("通过 " + passed + " 项，失败 " + failures.length + " 项");
  process.exit(1);
}
