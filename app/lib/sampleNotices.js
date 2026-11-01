/**
 * 示例通知生成器。纯函数，页面和自检脚本共用。
 *
 * 所有日期按传入的 now 动态生成，不写死。
 * 不走真实解析流程，直接构造好 analysis 和 deadlineDate，
 * 保证载入后立刻能看到效果，不调用 AI、不花钱。
 *
 * 6 条覆盖：
 *   1. 明天截止，含两个日期（靠前截止 / 靠后活动），有材料有地点，红色
 *   2. 三天后截止，有地点无材料，红色，会出现在待办
 *   3. 「下周三」相对日期，deadlineDate 为 null，可演示手动修改
 *   4. 活动通知，无日期，deadlineDate 为 null
 *   5. 两天前截止，已过期，灰色
 *   6. 五天后截止，有材料有地点，黄色
 */

const LF = String.fromCharCode(10);

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function atTime(date, hh, mm) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hh,
    mm,
    0,
    0
  );
}

function formatDateCN(date) {
  return date.getMonth() + 1 + "月" + date.getDate() + "日";
}

function formatDateFull(date) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

/**
 * @param {number|Date} now 基准时间
 * @returns {Array} 6 条完整 notice 对象
 */
export function buildSampleNotices(now) {
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);

  const tomorrow = addDays(base, 1);
  const dayAfter = addDays(base, 2);
  const threeDays = addDays(base, 3);
  const fiveDays = addDays(base, 5);
  const twoDaysAgo = addDays(base, -2);

  const tomorrowCN = formatDateCN(tomorrow);
  const dayAfterCN = formatDateCN(dayAfter);
  const threeDaysCN = formatDateCN(threeDays);
  const fiveDaysCN = formatDateCN(fiveDays);
  const twoDaysAgoCN = formatDateCN(twoDaysAgo);

  const tomorrowFull = formatDateFull(tomorrow);
  const threeDaysFull = formatDateFull(threeDays);
  const fiveDaysFull = formatDateFull(fiveDays);
  const twoDaysAgoFull = formatDateFull(twoDaysAgo);

  const savedAt = base.getTime();

  const n1 = {
    id: "sample_1",
    title: "关于报送国家助学金申请材料的通知",
    source: "示例",
    text:
      "关于报送国家助学金申请材料的通知" +
      LF +
      "各学院：" +
      LF +
      "请各学院于" +
      tomorrowCN +
      "下午5点前将《国家助学金申请表》和家庭经济困难证明复印件报送至学生资助管理中心A301办公室。评审会定于" +
      dayAfterCN +
      "举行，具体安排另行通知。",
    analysis: {
      deadline: tomorrowFull,
      time: "17:00",
      location: "学生资助管理中心A301办公室",
      materials: ["国家助学金申请表", "家庭经济困难证明", "复印件"],
      audience: "各学院",
      title: null,
      summary: "各学院于" + tomorrowCN + "17:00前报送国家助学金申请材料",
      category: "行政",
      _source: "rule",
    },
    deadlineDate: atTime(tomorrow, 17, 0).getTime(),
    savedAt,
  };

  const n2 = {
    id: "sample_2",
    title: "关于召开毕业班就业推进会的通知",
    source: "示例",
    text:
      "关于召开毕业班就业推进会的通知" +
      LF +
      "各毕业班班主任：" +
      LF +
      "学校定于" +
      threeDaysCN +
      "下午3点在就业指导中心会议室召开就业推进会。",
    analysis: {
      deadline: threeDaysFull,
      time: "15:00",
      location: "就业指导中心会议室",
      materials: [],
      audience: "各毕业班班主任",
      title: null,
      summary: "毕业班就业推进会于" + threeDaysCN + "下午3点召开",
      category: "行政",
      _source: "rule",
    },
    deadlineDate: atTime(threeDays, 15, 0).getTime(),
    savedAt,
  };

  const n3 = {
    id: "sample_3",
    title: "关于举办第十九届校园读书月的通知",
    source: "示例",
    text:
      "关于举办第十九届校园读书月的通知" +
      LF +
      "各班级：" +
      LF +
      "图书馆定于下周三上午9点在图书馆一楼多功能厅举办读书月开幕式，届时邀请知名作家到场签售。请有意参加的同学以班级为单位填写《参与意向登记表》，由班长统一于下周三中午前发至邮箱 tushuguan@example.edu.cn。",
    analysis: {
      deadline: "下周三",
      time: "09:00",
      location: "图书馆一楼多功能厅",
      materials: ["参与意向登记表"],
      audience: "各班级",
      title: null,
      summary: "下周三举办读书月开幕式，班长收齐参与意向登记表",
      category: "活动",
      _source: "rule",
    },
    deadlineDate: null,
    savedAt,
  };

  const n4 = {
    id: "sample_4",
    title: "关于举办第七届校园马拉松的通知",
    source: "示例",
    text:
      "关于举办第七届校园马拉松的通知" +
      LF +
      "各学院、全体在校师生：" +
      LF +
      "校工会将于近期在东体育场举行第七届校园马拉松，具体时间另行通知。",
    analysis: {
      deadline: null,
      time: null,
      location: "东体育场",
      materials: [],
      audience: "全体在校师生",
      title: null,
      summary: "近期在东体育场举行校园马拉松",
      category: "活动",
      _source: "rule",
    },
    deadlineDate: null,
    savedAt,
  };

  const n5 = {
    id: "sample_5",
    title: "关于领取冬季防寒物资的通知",
    source: "示例",
    text:
      "关于领取冬季防寒物资的通知" +
      LF +
      "各宿舍：" +
      LF +
      "后勤处已开始发放冬季防寒物资，请各宿舍长于" +
      twoDaysAgoCN +
      "到宿舍管理中心值班室登记领取。",
    analysis: {
      deadline: twoDaysAgoFull,
      time: null,
      location: "宿舍管理中心值班室",
      materials: [],
      audience: "各宿舍",
      title: null,
      summary: twoDaysAgoCN + "前到宿舍管理中心值班室领取防寒物资",
      category: "后勤",
      _source: "rule",
    },
    deadlineDate: atTime(twoDaysAgo, 17, 0).getTime(),
    savedAt,
  };

  const n6 = {
    id: "sample_6",
    title: "关于开展期中教学检查的通知",
    source: "示例",
    text:
      "关于开展期中教学检查的通知" +
      LF +
      "各学院：" +
      LF +
      "教务处将于近期开展期中教学检查。请各学院于" +
      fiveDaysCN +
      "下午2点前将《期中教学检查自查表》和本学期课程教学进度表报送至教务处B201办公室。",
    analysis: {
      deadline: fiveDaysFull,
      time: "14:00",
      location: "教务处B201办公室",
      materials: ["期中教学检查自查表", "课程教学进度表"],
      audience: "各学院",
      title: null,
      summary: "各学院于" + fiveDaysCN + "14:00前报送期中教学检查材料",
      category: "教务",
      _source: "rule",
    },
    deadlineDate: atTime(fiveDays, 14, 0).getTime(),
    savedAt,
  };

  return [n1, n2, n3, n4, n5, n6];
}

/**
 * 示例条数。从实际数组长度动态计算，不写死，
 * 以后增删示例不会和这个数对不上。
 */
export function getSampleCount() {
  return buildSampleNotices(Date.now()).length;
}