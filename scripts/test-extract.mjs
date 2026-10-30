import { extractNotice } from "../app/lib/extractNotice.js";

const SAMPLES = [
  {
    name: "样例1：标准型（你之前那段）",
    text: "根据学校工作安排，请各学院于2026年11月15日下午5点前将国家助学金申请表和家庭经济困难证明复印件报送至学生资助管理中心A301办公室，逾期不再受理。",
  },
  {
    name: "样例2：斜杠日期 + 标签地点",
    text: "因故未参加本学期体测的同学，请于11/20前到体育馆参加补测。报到时需携带学生证和身份证。地点：体育馆一楼大厅。",
  },
  {
    name: "样例3：相对时间",
    text: "全体学生：各班级须在本周五前组织一次安全教育主题班会，并提交班会记录表。活动地点：各班级教室。",
  },
  {
    name: "样例4：连写日期时间",
    text: "报名截止到2026-12-10 17:00。请登录教务系统完成报名，逾期系统自动关闭。咨询地点：行政楼205室。",
  },
  {
    name: "样例5：模糊日期 + 全校本科生",
    text: "面向全校本科生，请有意者在10月底前将报名表发送至图书馆办公室。地点：图书馆三楼会议室。",
  },
];

const argText = process.argv.slice(2).join(" ").trim();
const toRun = argText ? [{ name: "命令行传入", text: argText }] : SAMPLES;

for (const sample of toRun) {
  console.log("");
  console.log("==== " + sample.name + " ====");
  console.log("输入：", sample.text);
  console.log("结果：", JSON.stringify(extractNotice(sample.text), null, 2));
}

console.log("");
console.log("共 " + toRun.length + " 条测试完成。");