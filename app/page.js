"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SideNav from "./components/SideNav";
import AppHeader from "./components/AppHeader";
import WorkspaceOverview, { itemKey } from "./components/WorkspaceOverview";
import NewNoticeDialog from "./components/NewNoticeDialog";
import NoticeDetail from "./components/NoticeDetail";
import NoticeList from "./components/NoticeList";
import AnalysisPanel from "./components/AnalysisPanel";
import TodoList from "./components/TodoList";
import CalendarPage from "./components/CalendarPage";
import ChangeCenter from "./components/ChangeCenter";
import ShareDialog from "./components/ShareDialog";
import MultiSplitDialog from "./components/MultiSplitDialog";
import MultiResultPanel from "./components/MultiResultPanel";
import { buildDeadlineDate } from "./lib/deadline.js";
import { getTodoItems } from "./lib/todo.js";
import { buildRouteEvents } from "./lib/routeEvents.js";
import { buildScheduleAlerts } from "./lib/conflict.js";
import { updateNoticeAnalysis } from "./lib/noticeOps.js";
import { parseOne } from "./lib/parseOne.js";
import { splitNotices } from "./lib/splitNotices.js";
import { checkModeMismatch } from "./lib/modeGuard.js";
import { buildSampleNotices } from "./lib/sampleNotices.js";
import ItemsPanel from "./components/ItemsPanel";
import DuplicateDialog from "./components/DuplicateDialog";
import { buildItems } from "./lib/noticeItems.js";
import { migrateNotice } from "./lib/noticeMigrate.js";
import { checkBatchDuplicates, checkDuplicate } from "./lib/dedupe.js";
import PatchLinkDialog from "./components/PatchLinkDialog";
import PatchReviewDialog from "./components/PatchReviewDialog";
import {
  buildNoticePatch,
  matchPatchTarget,
  buildPatchReview,
  applyPatch,
} from "./lib/noticePatch.js";

const STORAGE_KEY = "zhiban.notices.v1";

function deriveTitle(text) {
  const lines = String(text || "").split(String.fromCharCode(10));
  for (const line of lines) {
    const t = line.split(String.fromCharCode(13)).join("").trim();
    if (t) return t.length > 30 ? t.slice(0, 30) + "…" : t;
  }
  return "未命名通知";
}

function makeId(seed) {
  return (
    "n_" +
    Date.now().toString(36) +
    "_" +
    (seed !== undefined ? seed : "") +
    "_" +
    Math.random().toString(36).slice(2, 6)
  );
}

function filterNotices(notices, query, category) {
  let result = notices;
  const q = query.trim();
  if (q) {
    result = result.filter(
      (n) =>
        (n.title && n.title.includes(q)) || (n.text && n.text.includes(q))
    );
  }
  if (category && category !== "全部") {
    // 示例不是一个分类字段，它标在通知最外层的来源上，要单独比
    if (category === "示例") {
      result = result.filter((n) => n.source === "示例");
    } else {
      result = result.filter(
        (n) => n.analysis && n.analysis.category === category
      );
    }
  }
  return result;
}

function sourceLabel(source) {
  if (source === "manual") return "手动修正";
  if (source === "mixed") return "模型补充";
  if (source === "rule_fallback") return "本地识别";
  if (source === "rule") return "本地识别";
  return "手动导入";
}

// 从通知里挑出所有待确认的事项，摊成工作台待确认区要用的事件形状。
// 字段状态和摊平事件那个模块保持一致：优先分析结果里的 items，没有再退回最外层。
function buildPendingItems(notices) {
  const out = [];
  for (const n of Array.isArray(notices) ? notices : []) {
    const items =
      (n.analysis && n.analysis.items) || n.items || [];
    items.forEach((item, idx) => {
      const status = item && item.status;
      if (!status) return;
      const hasPending = Object.values(status).some((v) => v === "pending");
      if (!hasPending) return;
      out.push({
        noticeId: n.id,
        noticeTitle: n.title,
        itemIndex: idx,
        name: item.name,
        ts: null,
        location: item.location || "",
        materials: Array.isArray(item.materials) ? item.materials : [],
        progress: "待确认",
        timeType: item.timeType || "deadline",
      });
    });
  }
  return out;
}

export default function Home() {
  const router = useRouter();
  const [notices, setNotices] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [noticeText, setNoticeText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [showShare, setShowShare] = useState(false);
  const [inputMode, setInputMode] = useState("single");
  // 通知发布日期：只当换算基准用。空串表示没填，绝不能拿今天顶上去。
  const [publishedAt, setPublishedAt] = useState("");
  const [warningCandidate, setWarningCandidate] = useState(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  // 多通知的切分确认弹窗与解析结果。
  // 结果不再放在输入框下面，改到右下那块面板，和单条通知同一个位置。
  const [splitDialog, setSplitDialog] = useState({
    open: false,
    items: [],
    reason: "",
  });
  const [batchResults, setBatchResults] = useState([]);

  // 原文动过但还没重新解析：结果区提示、禁止保存
  const [dirty, setDirty] = useState(false);
  // 命中去重弹窗时的暂存
  const [duplicate, setDuplicate] = useState(null);
  // 用户选择仍然导入后放行，直到保存完成才清掉，
  // 否则保存时又被查一次重复，陷入循环
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  // 第四轮工作台外壳：当前视图、新增通知弹窗、统计点亮、选中事项、启动门槛
  const [view, setView] = useState("workbench");
  const [showNew, setShowNew] = useState(false);
  const [focus, setFocus] = useState(null);
  const [selectedItemKey, setSelectedItemKey] = useState(null);
  const [booting, setBooting] = useState(true);

  // 补充通知流程：抽取结果、当前步骤、选中的原通知与事项、对比结果、提醒
  const [patchDraft, setPatchDraft] = useState(null);
  const [patchStep, setPatchStep] = useState("closed");
  const [patchNoticeId, setPatchNoticeId] = useState(null);
  const [patchIndexes, setPatchIndexes] = useState([]);
  const [patchReview, setPatchReview] = useState(null);
  const [patchAlerts, setPatchAlerts] = useState([]);
  // 刚刚确认更新后的成功提示数据，给变更记录页用
  const [patchSuccess, setPatchSuccess] = useState(null);

  // 本地保存失败的界面提示。非空时顶部出现提示条，
  // 内容留在页面上不动，用户可以原地重试。
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setNotices(parsed.map(migrateNotice));
      }
    } catch (e) {
      console.warn("读取本地通知失败：", e);
    }
    setHydrated(true);

    // 欢迎页看过没有：看过就直接结束启动，没看过交给下面那个副作用跳转
    try {
      const welcomed = localStorage.getItem("zhiban.welcomed");
      if (welcomed === "1") setBooting(false);
    } catch (e) {
      console.warn("读取欢迎页标记失败：", e);
    }
  }, []);

  // 没看过欢迎页的先送去欢迎页，别让他们直接闪到工作台
  useEffect(() => {
    let welcomed = null;
    try {
      welcomed = localStorage.getItem("zhiban.welcomed");
    } catch (e) {
      console.warn("读取欢迎页标记失败：", e);
    }
    if (welcomed !== "1") {
      router.replace("/welcome");
    } else {
      setBooting(false);
    }
    // 只在挂载时跑一次
  }, []);

  // 真正往本地存储写一次。成功返回真并清掉旧提示，失败返回假并亮出提示。
  // 重试入口也走这个函数，所以它必须是独立可调用的，不能只写在副作用里。
  function persistNotices(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setSaveError(null);
      return true;
    } catch (e) {
      console.warn("保存本地通知失败：", e);
      setSaveError({ snapshot: list });
      return false;
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    // 已经有未解决的保存失败时就别自动重写，免得把提示自己冲掉
    if (saveError) return;
    persistNotices(notices);
  }, [notices, hydrated, saveError]);

  function handleRetrySave() {
    const snapshot = saveError && saveError.snapshot;
    const list = Array.isArray(snapshot) ? snapshot : notices;
    persistNotices(list);
  }

  function handleDismissSaveError() {
    setSaveError(null);
  }

  useEffect(() => {
    setWarningDismissed(false);

    if (!noticeText.trim()) {
      setWarningCandidate(null);
      return;
    }

    const timer = setTimeout(() => {
      const result = checkModeMismatch(noticeText, inputMode);
      setWarningCandidate(result.shouldWarn ? result : null);
    }, 300);

    return () => clearTimeout(timer);
  }, [noticeText, inputMode]);

  const warning =
    warningCandidate && !warningDismissed ? warningCandidate : null;

  const now = Date.now();
  const filtered = filterNotices(notices, searchQuery, categoryFilter);
  // 日历和待办都从事项摊平出来的同一份事件走，改了事项两边一起变
  const routeEvents = buildRouteEvents(filtered);
  // 全页面只算这一份提醒，工作台和日历都用它，两边显示的才会一致
  const scheduleAlerts = buildScheduleAlerts(routeEvents);
  const todoItems = getTodoItems(routeEvents, now);
  // 工作台三组数据：待确认单独算，即将截止就是待办那一份，待办理取全部未办的按时间排序
  const pendingItems = buildPendingItems(filtered);
  const soonItems = todoItems;
  const todoSlim = routeEvents
    .filter((e) => e.progress !== "已办理" && e.progress !== "无需办理")
    .slice()
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(0, 12);

  const selectedNotice = notices.find((n) => n.id === selectedId) ?? null;
  const displayAnalysis = selectedId
    ? selectedNotice?.analysis ?? null
    : analysis;

  function handleHighlightSpan(span) {
    const el = document.getElementById("notice-text");
    if (!el) return;

    // 传进来的可能是历史记录里的原句字符串，也可能是带下标的对象；
    // 统一换算出当前原文里真实存在的 [start, end)，算不出来就不选。
    let start = null;
    let end = null;
    if (typeof span === "string") {
      const needle = span;
      if (!needle) return;
      const at = el.value.indexOf(needle);
      if (at < 0) return;
      start = at;
      end = at + needle.length;
    } else if (span && typeof span === "object") {
      const s = span.start;
      const e = span.end;
      const len = el.value.length;
      if (
        Number.isInteger(s) &&
        Number.isInteger(e) &&
        s >= 0 &&
        e <= len &&
        s < e
      ) {
        start = s;
        end = e;
      }
    }
    if (start === null || end === null) return;

    el.focus();
    el.setSelectionRange(start, end);
    // 把选中位置滚动到可见处
    const lineHeight = 24;
    const approxTop = Math.max(
      0,
      el.value.slice(0, start).split(String.fromCharCode(10)).length *
        lineHeight -
        el.clientHeight / 2
    );
    el.scrollTop = approxTop;
  }

  function handleSelect(id) {
    const target = notices.find((n) => n.id === id);
    if (!target) return;
    setSelectedId(id);
    setNoticeText(target.text);
    setAnalysis(target.analysis);
    // 从工作台跳过来的时候清掉那边的选中态，免得两边对不上
    setSelectedItemKey(null);
    // 点已存通知时把上次批量的残留和模式提示都清掉
    setBatchResults([]);
    setSplitDialog({ open: false, items: [], reason: "" });
    setWarningCandidate(null);
    setWarningDismissed(true);
    setDirty(false);
    setAllowDuplicate(false);
  }

  function handleDelete(id) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setNoticeText("");
      setAnalysis(null);
    }
  }

  async function handleParse(opts) {
    // 这个函数也当按钮回调用，React 可能把事件对象传进来；
    // 只认我们自己塞的 { forceImport: true }，别的都当作没有放行。
    const forceImport =
      opts && opts.forceImport === true ? true : false;
    const text = noticeText.trim();
    if (!text) {
      alert("请先粘贴或输入通知原文，再点击解析。");
      return;
    }
    setSelectedId(null);

    // 补充通知：先跑抽取，命中就转去关联原通知，不走普通解析也不查重
    if (inputMode !== "multi") {
      const patch = buildNoticePatch(text);
      if (patch && patch.isPatch && notices.length > 0) {
        // 补充通知走的是弹窗流程，粘贴弹窗要先收掉，别压在对比弹窗底下
        setShowNew(false);
        setPatchDraft(patch);
        setPatchStep("link");
        setPatchNoticeId(null);
        setPatchIndexes([]);
        setPatchReview(null);
        setPatchAlerts([]);
        return;
      }
    }

    // 单条模式先查重：命中就弹窗，别直接开跑
    if (inputMode !== "multi" && !allowDuplicate && !forceImport) {
      const dup = checkDuplicate(text, notices);
      if (dup && dup.type !== "none") {
        setShowNew(false);
        setDuplicate(dup);
        return;
      }
    }

    // 多通知先弹窗确认分法，不直接开跑。
    // 切不出来也要弹，闷声不响用户以为程序坏了。
    if (inputMode === "multi") {
      setShowNew(false);
      const sp = splitNotices(text);
      if (!sp.ok || !sp.items || sp.items.length < 2) {
        setSplitDialog({
          open: true,
          items: [],
          reason: sp.ok
            ? "只认出一条通知。如果你粘的是好几条，它们之间要空一行。"
            : sp.reason || "无法可靠分割",
        });
        return;
      }
      setSplitDialog({ open: true, items: sp.items, reason: "" });
      return;
    }

    setParsing(true);
    // 统一传入对象，字段名 publishedAt；没填就传空串，由下游判断“没有基准”
    const baseOpts = { publishedAt: publishedAt || "" };
    const result = await parseOne(text, baseOpts);
    const withItems = {
      ...result.analysis,
      items: buildItems(text, baseOpts),
    };
    setAnalysis(withItems);
    setDirty(false);
    setParsing(false);
    // 解析完关掉新增通知弹窗，直接把结果摆到眼前
    setShowNew(false);
    setView("notices");
  }

  function handleDuplicateView(notice) {
    setDuplicate(null);
    handleSelect(notice.id);
  }

  function handleDuplicateImport() {
    // 放行状态一直保留到保存完成，避免保存时二次查重。
    // state 更新是异步的，本次渲染里 allowDuplicate 还是 false，
    // 所以这次解析直接用 forceImport 同步放行，不走 state 判断。
    setAllowDuplicate(true);
    setDuplicate(null);
    handleParse({ forceImport: true });
  }

  function handleDuplicateCancel() {
    setDuplicate(null);
  }

  async function handleConfirmSplit(kept) {
    setSplitDialog({ open: false, items: [], reason: "" });
    setParsing(true);
    const results = [];
    // 先一次性拿到每条跟已有通知、跟同批次前文的判定，顺序与 kept 一致。
    // 批内命中的 notice 只是 { text } 包装对象，没有 id/title，后面展示要当心。
    const batchDup = checkBatchDuplicates(kept, notices);
    for (let i = 0; i < kept.length; i++) {
      const t = kept[i];
      const dup = batchDup[i] || { type: "none", notice: null, score: 0, withinBatch: false };
      const isDupHit = dup.type !== "none";
      try {
        // 每条都用同一个基准，循环里只读不写
        const baseOpts = { publishedAt: publishedAt || "" };
        const r = await parseOne(t, baseOpts);
        const src = r.analysis._source;
        // 和单条解析一个口径补事项，否则详情里显示"没有拆出具体事项"
        const withItems = {
          ...r.analysis,
          items: buildItems(t, baseOpts),
        };
        results.push({
          text: t,
          // 解析结果一律留住，命中重复只靠 skip 控制存不存
          status: src === "rule_fallback" ? "fallback" : "success",
          analysis: withItems,
          errorMsg: r.error ? String(r.error.message || r.error.code || "") : "",
          dupInfo: dup,
          // 命中重复默认跳过；用户点「明确另存」才翻成 false
          skip: isDupHit,
          keep: false,
        });
      } catch (e) {
        results.push({
          text: t,
          status: "error",
          analysis: null,
          errorMsg: String(e?.message || e),
          dupInfo: dup,
          skip: isDupHit,
          keep: false,
        });
      }
    }
    setBatchResults(results);
    // 批量结果已经生成，原文与结果一致，清掉待重新解析标记，
    // 否则 save 按钮永远灰、顶部一直挂着提示。
    // 切分弹窗取消走不到这里，dirty 不会被误清。
    setDirty(false);
    setParsing(false);
    setShowNew(false);
    setView("notices");
  }

  // 批量结果面板上的「跳过本条 / 明确另存」切换。
  // skip 为真表示跳过，为假表示明确另存（放行）。
  function handleToggleBatchSkip(index, skip) {
    setBatchResults((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        return {
          ...it,
          skip: Boolean(skip),
          // 明确另存就记 keep，保存时二次查重放行
          keep: !skip,
        };
      })
    );
  }

  async function handleParseAsSingle() {
    setSplitDialog({ open: false, items: [], reason: "" });
    setInputMode("single");
    setParsing(true);
    const singleText = noticeText.trim();
    const baseOpts = { publishedAt: publishedAt || "" };
    const result = await parseOne(singleText, baseOpts);
    const withItems = {
      ...result.analysis,
      items: buildItems(singleText, baseOpts),
    };
    setAnalysis(withItems);
    setDirty(false);
    setParsing(false);
  }

  const batchSavable = batchResults.filter(
    (it) => it.skip !== true && it.analysis
  ).length;

  function handleSave() {
    // 原文改过还没重解析，不许存
    if (dirty) return;
    if (inputMode === "multi") {
      handleBatchSave(
        batchResults
          .filter((it) => it.skip !== true && it.analysis)
          .map((it) => ({
            text: it.text,
            analysis: it.analysis,
            keep: it.keep === true,
          }))
      );
      setBatchResults([]);
      return;
    }
    if (!analysis || selectedId) return;
    const deadlineDate = buildDeadlineDate(analysis.deadline, analysis.time);
    const notice = {
      id: makeId(),
      title: analysis.title || deriveTitle(noticeText),
      source: sourceLabel(analysis._source),
      text: noticeText,
      analysis,
      items:
        analysis.items ||
        buildItems(noticeText, { publishedAt: publishedAt || "" }),
      // 存下当时的发布日期，老通知补事项时按它换算，空串就是没填
      publishedAt: publishedAt || "",
      deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
      savedAt: Date.now(),
    };
    setNotices((prev) => [notice, ...prev]);
    setSelectedId(notice.id);
    setDirty(false);
    setAllowDuplicate(false);
  }

  // 专门改某个事项的办理状态：已保存的写回列表里那条，草稿只改当前结果。
  function handleUpdateItem(index, nextProgress) {
    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) => {
          if (n.id !== selectedId) return n;
          const list = (n.analysis?.items || []).slice();
          if (!list[index]) return n;
          list[index] = { ...list[index], progress: nextProgress };
          // 事项存两处，最外层和分析结果里都要写，只改一处日历那边不动
          return {
            ...n,
            items: list,
            analysis: { ...n.analysis, items: list },
          };
        })
      );
    } else {
      setAnalysis((prev) => {
        if (!prev) return prev;
        const list = (prev.items || []).slice();
        if (!list[index]) return prev;
        list[index] = { ...list[index], progress: nextProgress };
        return { ...prev, items: list, _source: "manual" };
      });
    }
  }

  // 材料勾选：第 index 个事项、第 materialIndex 项材料，ready 置为 true 或 false
  function handleToggleMaterial(index, materialIndex, ready) {
    function apply(analysisObj) {
      if (!analysisObj) return analysisObj;
      const list = (analysisObj.items || []).slice();
      if (!list[index]) return analysisObj;
      const mats = Array.isArray(list[index].materials)
        ? list[index].materials.slice()
        : [];
      if (!mats[materialIndex]) return analysisObj;
      mats[materialIndex] = { ...mats[materialIndex], ready: Boolean(ready) };
      list[index] = { ...list[index], materials: mats };
      return { ...analysisObj, items: list };
    }

    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId
            ? (() => {
                const next = apply(n.analysis);
                return { ...n, items: next.items, analysis: next };
              })()
            : n
        )
      );
    } else {
      setAnalysis((prev) => (prev ? { ...apply(prev), _source: "manual" } : prev));
    }
  }

  // 完成状态切换：第 index 个事项变为 nextProgress
  function handleToggleComplete(index, nextProgress) {
    function apply(analysisObj) {
      if (!analysisObj) return analysisObj;
      const list = (analysisObj.items || []).slice();
      if (!list[index]) return analysisObj;
      list[index] = { ...list[index], progress: nextProgress };
      return { ...analysisObj, items: list };
    }

    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId
            ? (() => {
                const next = apply(n.analysis);
                return { ...n, items: next.items, analysis: next };
              })()
            : n
        )
      );
    } else {
      setAnalysis((prev) => (prev ? { ...apply(prev), _source: "manual" } : prev));
    }
  }

  // 就地修改事项里的某个字段，目前支持日期和地点。
  // 改完状态算正常并在这个字段上打手动标记，免得被判成待确认或存疑。
  function handleEditItemField(index, fieldKey, nextValue) {
    function apply(analysisObj) {
      if (!analysisObj) return analysisObj;
      const list = (analysisObj.items || []).slice();
      if (!list[index]) return analysisObj;
      const target = { ...list[index] };

      if (fieldKey === "date") {
        target.date = nextValue;
        target.status = {
          ...(target.status || {}),
          date: nextValue ? "ok" : "not_mentioned",
        };
      } else if (fieldKey === "location") {
        target.location = nextValue;
        target.status = {
          ...(target.status || {}),
          location: nextValue ? "ok" : "not_mentioned",
        };
      }

      target._manualFields = {
        ...(target._manualFields || {}),
        [fieldKey]: true,
      };

      list[index] = target;
      return { ...analysisObj, items: list };
    }

    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId
            ? (() => {
                const next = apply(n.analysis);
                return { ...n, items: next.items, analysis: next };
              })()
            : n
        )
      );
    } else {
      setAnalysis((prev) => (prev ? { ...apply(prev), _source: "manual" } : prev));
    }
  }

  function handleUpdateAnalysis(patch) {
    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId ? updateNoticeAnalysis(n, patch) : n
        )
      );
    } else {
      setAnalysis((prev) =>
        prev ? { ...prev, ...patch, _source: "manual" } : prev
      );
    }
  }

  function handleBatchSave(items) {
    if (items && items.length > 0) {
      const newNotices = [];
      const seen = notices.slice();
      let seed = 0;

      for (const item of items) {
        // 解析失败或没留下结果的那条直接跳过，别让一条坏数据带崩整批
        if (!item || !item.analysis) continue;
        // 用户明确另存的放行；其余用新查重再挡一次（只挡完全相同的正文）
        if (!item.keep) {
          const again = checkDuplicate(item.text, seen);
          if (again && again.type === "exact") continue;
        }
        const deadlineDate = buildDeadlineDate(
          item.analysis.deadline,
          item.analysis.time
        );
        const notice = {
          id: makeId(seed++),
          title: item.analysis.title || deriveTitle(item.text),
          source: sourceLabel(item.analysis._source),
          text: item.text,
          analysis: item.analysis,
          // 事项和单条一样存顶层的 items；解析结果里没有就现场补一份
          items:
            (item.analysis && Array.isArray(item.analysis.items))
              ? item.analysis.items
              : buildItems(item.text, { publishedAt: publishedAt || "" }),
          // 批量的每条都用同一个基准，存下来供日后补事项
          publishedAt: publishedAt || "",
          deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
          savedAt: Date.now(),
        };
        newNotices.push(notice);
        seen.push(notice);
      }

      if (newNotices.length > 0) {
        setNotices((prev) => [...newNotices, ...prev]);
      }
    }

    setNoticeText("");
    setSelectedId(null);
    setAnalysis(null);
    setWarningCandidate(null);
    setWarningDismissed(false);
  }

  function handleLoadSamples() {
    // 示例只往前插，不许清空同学自己存的通知
    const samples = buildSampleNotices(Date.now());
    setNotices((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const toAdd = samples.filter((s) => !existingIds.has(s.id));
      return [...toAdd, ...prev];
    });
    setSelectedId(null);
    setNoticeText("");
    setAnalysis(null);
  }

  function handleTextChange(text) {
    setNoticeText(text);
    setDirty(true);
    // 原文改了，放行状态也该失效，重新解析时重新判断重复
    setAllowDuplicate(false);
    // 原文动了，上一次多通知的结果就是旧的，继续显示会误导。
    if (batchResults.length > 0) setBatchResults([]);
  }

  function handleModeChange(newMode) {
    // 换模式就是换一种活法，另一个模式的结果不能留着，
    // 不然上半区写着单条、下半区还挂着三条结果，对不上。
    setBatchResults([]);
    setSplitDialog({ open: false, items: [], reason: "" });
    setInputMode(newMode);
  }

  function handleSwitchMode(newMode) {
    setBatchResults([]);
    setInputMode(newMode);
    setWarningDismissed(true);
  }

  function handlePatchPickNotice(noticeId, indexes) {
    const notice = notices.find((n) => n.id === noticeId);
    if (!notice) return;
    const items = notice.analysis?.items || notice.items || [];
    // 兜底：传进来是空数组就用这条通知自己再算一次匹配下标
    let useIndexes = Array.isArray(indexes) ? indexes : [];
    if (useIndexes.length === 0 && patchDraft) {
      const m = matchPatchTarget(items, patchDraft) || {};
      useIndexes = Array.isArray(m.indexes) ? m.indexes : [];
    }
    const review = buildPatchReview(items, patchDraft, useIndexes);
    // 干跑一次落盘函数只为把提醒先算出来，它是纯函数不改原数据
    const dry = applyPatch(items, patchDraft, useIndexes, Date.now());
    setPatchAlerts(Array.isArray(dry && dry.alerts) ? dry.alerts : []);
    setPatchNoticeId(noticeId);
    setPatchIndexes(useIndexes);
    setPatchReview(review);
    setPatchStep("review");
  }

  // 补结束时间：只改这一条通知的这一个事项的结束时间，开始时间、日期、其它事项一概不碰。
  // 事项存两处，必须用同一份新数组同时写回最外层 items 和分析结果里的 items。
  function handleFillEndTime(noticeId, itemIndex, endTime) {
    const value = typeof endTime === "string" ? endTime.trim() : "";
    const m = /^([0-9]{2}):([0-9]{2})$/.exec(value);
    if (!m) return;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return;

    setNotices((prev) =>
      prev.map((n) => {
        if (n.id !== noticeId) return n;
        const list = ((n.analysis && n.analysis.items) || n.items || []).slice();
        const target = list[itemIndex];
        if (!target) return n;

        // 结束时间不能早于或等于开始时间，否则可能是跨午夜或填错，宁可不写
        const startTime = target.time || "";
        const sm = /^([0-9]{2}):([0-9]{2})$/.exec(startTime);
        if (sm) {
          const startMinutes = Number(sm[1]) * 60 + Number(sm[2]);
          const endMinutes = hh * 60 + mm;
          if (endMinutes <= startMinutes) return n;
        }

        const next = {
          ...target,
          endTime: value,
          // 记下来源：这是同学自己估的，通知原文没写。
          // 走的就是这个入口，所以能到这儿就是 user，不用再判断。
          endTimeSource: value ? "user" : null,
          status: {
            ...(target.status || {}),
            endTime: value ? "ok" : "not_mentioned",
          },
        };
        list[itemIndex] = next;
        return { ...n, items: list, analysis: { ...n.analysis, items: list } };
      })
    );
  }

  function handlePatchConfirm() {
    const notice = notices.find((n) => n.id === patchNoticeId);
    if (!notice || !patchDraft) return;
    const items = notice.analysis?.items || notice.items || [];
    const result = applyPatch(items, patchDraft, patchIndexes, Date.now());
    const nextItems = result.items;
    const record = result.record;
    setNotices((prev) =>
      prev.map((n) => {
        if (n.id !== patchNoticeId) return n;
        const history = Array.isArray(n.history) ? n.history.slice() : [];
        history.push(record);
        // 事项存两处，最外层和分析结果里都要写，只写一处日历那边不动
        return {
          ...n,
          items: nextItems,
          analysis: { ...n.analysis, items: nextItems },
          history: history,
        };
      })
    );

    // 确认成功之后把受影响的事项名称留下来，切到变更页让同学立刻看到结果
    const affectedNames = (Array.isArray(patchIndexes) ? patchIndexes : [])
      .map((i) => (items[i] ? items[i].name : null))
      .filter(Boolean);
    // 只针对这一条改完的通知重算提醒，让用户看到新安排下的提醒状况
    const patchedAlerts = buildScheduleAlerts(
      buildRouteEvents(
        notices
          .filter((n) => n.id === patchNoticeId)
          .map((n) => ({
            ...n,
            items: nextItems,
            analysis: { ...n.analysis, items: nextItems },
          }))
      )
    );
    setPatchSuccess({
      noticeId: notice.id,
      title: notice.title,
      itemNames: affectedNames,
      changes: Array.isArray(record.changes) ? record.changes : [],
      alertCount: patchedAlerts.length,
      alertTopTitle: patchedAlerts.length > 0 ? patchedAlerts[0].title : "",
    });
    setView("changes");

    setPatchStep("closed");
    setPatchDraft(null);
    setPatchReview(null);
    setPatchNoticeId(null);
    setPatchIndexes([]);
    setPatchAlerts([]);
    handleSelect(notice.id);
  }

  function handlePatchCancel() {
    // 取消一律当作没发生，原通知一个字都不改
    setPatchStep("closed");
    setPatchDraft(null);
    setPatchReview(null);
    setPatchNoticeId(null);
    setPatchIndexes([]);
    setPatchAlerts([]);
  }

  function handleDismissWarning() {
    setWarningDismissed(true);
  }

  // 工作台上的事项可能不属于当前选中的通知，所以要按事件自带的编号定位，
  // 找到之后最外层的 items 和分析结果里的 items 两处都要写，只写一处日历不跟着变。
  function handleToggleEventComplete(event, nextProgress) {
    if (!event) return;
    const targetId = event.noticeId;
    const index = event.itemIndex;
    setNotices((prev) =>
      prev.map((n) => {
        if (n.id !== targetId) return n;
        const list = ((n.analysis && n.analysis.items) || n.items || []).slice();
        if (!list[index]) return n;
        list[index] = { ...list[index], progress: nextProgress };
        return { ...n, items: list, analysis: { ...n.analysis, items: list } };
      })
    );
  }

  function handleToggleEventMaterial(event, materialIndex, ready) {
    if (!event) return;
    const targetId = event.noticeId;
    const index = event.itemIndex;
    setNotices((prev) =>
      prev.map((n) => {
        if (n.id !== targetId) return n;
        const list = ((n.analysis && n.analysis.items) || n.items || []).slice();
        if (!list[index]) return n;
        const mats = Array.isArray(list[index].materials)
          ? list[index].materials.slice()
          : [];
        if (!mats[materialIndex]) return n;
        mats[materialIndex] = { ...mats[materialIndex], ready: Boolean(ready) };
        list[index] = { ...list[index], materials: mats };
        return { ...n, items: list, analysis: { ...n.analysis, items: list } };
      })
    );
  }

  const counts = {
    notices: filtered.length,
    pending: pendingItems.length,
    soon: soonItems.length,
    todo: todoSlim.length,
    changes: notices.filter(
      (n) => Array.isArray(n.history) && n.history.length > 0
    ).length,
  };

  const headerTitle =
    view === "workbench"
      ? "工作台"
      : view === "notices"
      ? "我的通知"
      : view === "calendar"
      ? "日历"
      : "变更记录";

  function handleFocusStat(key) {
    setFocus(key);
    setView("workbench");
  }

  function handleOpenItem(event) {
    if (!event) return;
    setSelectedItemKey(itemKey(event));
    handleSelect(event.noticeId);
    setView("notices");
  }

  function handleOpenNew() {
    setShowNew(true);
  }

  function handleCloseNew() {
    setShowNew(false);
  }

  if (booting) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0F172A]">
        <div className="text-[20px] font-bold text-white">知办</div>
        <div className="mt-2 text-[12px] text-white/55">正在载入本地数据</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <SideNav
        view={view}
        onViewChange={setView}
        counts={counts}
        onCreate={handleOpenNew}
        onBackWelcome={() => router.push("/welcome")}
        onFocusStat={handleFocusStat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={headerTitle}
          subtitle={"一共 " + notices.length + " 条通知"}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          category={categoryFilter === "全部" ? "all" : categoryFilter}
          onCategoryChange={(v) =>
            setCategoryFilter(v === "all" ? "全部" : v)
          }
          onOpenShare={() => setShowShare(true)}
          right={
            <button
              type="button"
              onClick={handleLoadSamples}
              className="inline-flex h-9 items-center rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-[13px] text-[#0F172A] transition-colors duration-200 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 motion-reduce:transition-none"
            >
              载入示例通知
            </button>
          }
        />

        {saveError && (
          <div
            role="alert"
            className="flex flex-none items-center gap-3 border-b border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-[13px] text-[#991B1B]"
          >
            <span>这次没保存成功，你写的内容和解析结果都还在。</span>
            <button
              type="button"
              onClick={handleRetrySave}
              className="inline-flex h-8 items-center rounded-[8px] border border-[#FCA5A5] bg-white px-3 text-[13px] text-[#991B1B] transition-colors duration-200 ease-out hover:bg-[#FEE2E2] motion-reduce:transition-none"
            >
              再试一次
            </button>
            <button
              type="button"
              onClick={handleDismissSaveError}
              className="ml-auto inline-flex h-8 items-center rounded-[8px] px-2 text-[13px] text-[#991B1B]/80 hover:bg-[#FEE2E2]"
            >
              先不管
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">
          {view === "workbench" && (
            <div className="h-full overflow-y-auto">
              <WorkspaceOverview
                now={now}
                groups={{
                  pending: pendingItems,
                  soon: soonItems,
                  todo: todoSlim,
                }}
                stats={counts}
                focus={focus}
                selectedKey={selectedItemKey}
                onOpenItem={handleOpenItem}
                onComplete={handleToggleEventComplete}
                onToggleMaterial={handleToggleEventMaterial}
                onFocusStat={handleFocusStat}
                onCreate={handleOpenNew}
                alerts={scheduleAlerts}
                onFillEndTime={handleFillEndTime}
              />
            </div>
          )}

          {view === "notices" && (
            <div className="flex h-full min-h-0">
              <div className="flex w-[320px] flex-none flex-col overflow-hidden border-r border-slate-200 bg-white">
                <NoticeList
                  notices={filtered}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                  hydrated={hydrated}
                />
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {inputMode === "multi" && batchResults.length > 0 ? (
                  <div className="h-full overflow-y-auto">
                    <MultiResultPanel
                      items={batchResults}
                      onSave={handleSave}
                      onSkip={handleToggleBatchSkip}
                      canSave={!dirty && batchSavable > 0 && !parsing}
                      saveLabel={
                        parsing
                          ? "解析中…"
                          : batchSavable > 0
                          ? "保存 " + batchSavable + " 条到我的通知"
                          : "保存到我的通知"
                      }
                    />
                  </div>
                ) : (
                  <NoticeDetail
                    status={
                      parsing
                        ? "解析中"
                        : displayAnalysis && displayAnalysis._aiErrorCode
                        ? "解析失败"
                        : selectedId
                        ? "已保存"
                        : displayAnalysis &&
                          Array.isArray(displayAnalysis.items) &&
                          displayAnalysis.items.some(
                            (it) =>
                              it &&
                              it.status &&
                              Object.values(it.status).some(
                                (v) => v === "pending"
                              )
                          )
                        ? "待确认"
                        : displayAnalysis
                        ? "草稿"
                        : "待解析"
                    }
                    text={noticeText}
                    onTextChange={handleTextChange}
                    readOnly={Boolean(selectedId)}
                    noticeTitle={
                      (selectedNotice && selectedNotice.title) ||
                      (displayAnalysis && displayAnalysis.title) ||
                      ""
                    }
                    sourceLabel={
                      (selectedNotice && selectedNotice.source) || ""
                    }
                    analysis={displayAnalysis}
                    dirty={dirty}
                    parsing={parsing}
                    onReparse={handleParse}
                    onSave={handleSave}
                    canSave={
                      dirty
                        ? false
                        : inputMode === "multi"
                        ? batchSavable > 0 && !parsing
                        : Boolean(analysis) && !selectedId && !parsing
                    }
                    saveLabel={
                      parsing
                        ? "解析中…"
                        : inputMode === "multi"
                        ? batchSavable > 0
                          ? "保存 " + batchSavable + " 条到我的通知"
                          : "保存到我的通知"
                        : selectedId
                        ? "已保存"
                        : "保存到我的通知"
                    }
                    onDelete={
                      selectedId ? () => handleDelete(selectedId) : undefined
                    }
                  >
                    <AnalysisPanel
                      selectedNotice={selectedNotice}
                      analysis={displayAnalysis}
                      draftText={noticeText}
                      onUpdate={handleUpdateAnalysis}
                      onUpdateItem={handleUpdateItem}
                      onFieldClick={handleHighlightSpan}
                      onToggleMaterial={handleToggleMaterial}
                      onToggleComplete={handleToggleComplete}
                      onEditItemField={handleEditItemField}
                    />
                  </NoticeDetail>
                )}
              </div>
            </div>
          )}

          {view === "calendar" && (
            <div className="h-full w-full overflow-y-auto">
              <CalendarPage
                notices={filtered}
                now={now}
                onOpenItem={handleOpenItem}
                alerts={scheduleAlerts}
                onFillEndTime={handleFillEndTime}
              />
            </div>
          )}

          {view === "changes" && (
            <div className="h-full w-full overflow-y-auto">
              <ChangeCenter
                notices={notices}
                success={patchSuccess}
                onDismissSuccess={() => setPatchSuccess(null)}
                onOpenNotice={(id) => {
                  handleSelect(id);
                  setView("notices");
                }}
                onCreatePatch={handleOpenNew}
                highlightNoticeId={
                  patchSuccess && patchSuccess.noticeId
                    ? patchSuccess.noticeId
                    : null
                }
              />
            </div>
          )}
        </main>
      </div>

      {splitDialog.open && (
        <MultiSplitDialog
          open={splitDialog.open}
          items={splitDialog.items}
          reason={splitDialog.reason}
          onConfirm={handleConfirmSplit}
          onCancel={() =>
            setSplitDialog({ open: false, items: [], reason: "" })
          }
          onParseAsSingle={handleParseAsSingle}
        />
      )}

      {duplicate && (
        <DuplicateDialog
          duplicate={duplicate}
          onClose={handleDuplicateCancel}
          onView={handleDuplicateView}
          onImport={handleDuplicateImport}
          onCancel={handleDuplicateCancel}
        />
      )}

      {patchStep === "link" && patchDraft && (
        <PatchLinkDialog
          notices={notices}
          patchResult={patchDraft}
          onCancel={handlePatchCancel}
          onNext={handlePatchPickNotice}
        />
      )}

      {patchStep === "review" && patchReview && (
        <PatchReviewDialog
          review={patchReview}
          rawText={(patchDraft && patchDraft.rawText) || ""}
          alerts={patchAlerts}
          onConfirm={handlePatchConfirm}
          onCancel={handlePatchCancel}
          onFieldClick={(span) => handleHighlightSpan(span)}
        />
      )}

      {showShare && (
        <ShareDialog
          notices={notices}
          now={now}
          onClose={() => setShowShare(false)}
        />
      )}

      <NewNoticeDialog
        open={showNew}
        value={noticeText}
        onChange={handleTextChange}
        mode={inputMode}
        onModeChange={handleModeChange}
        parsing={parsing}
        onParse={handleParse}
        onClose={handleCloseNew}
        publishedAt={publishedAt}
        onPublishedAtChange={setPublishedAt}
      />
    </div>
  );
}