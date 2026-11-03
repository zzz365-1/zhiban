"use client";

import { useState, useEffect } from "react";
import TopBar from "./components/TopBar";
import NoticeList from "./components/NoticeList";
import NoticeInput from "./components/NoticeInput";
import AnalysisPanel from "./components/AnalysisPanel";
import TodoList from "./components/TodoList";
import CalendarView from "./components/CalendarView";
import ShareDialog from "./components/ShareDialog";
import MultiSplitDialog from "./components/MultiSplitDialog";
import MultiResultPanel from "./components/MultiResultPanel";
import { buildDeadlineDate } from "./lib/deadline.js";
import { getTodoItems } from "./lib/todo.js";
import { buildRouteEvents } from "./lib/routeEvents.js";
import { updateNoticeAnalysis } from "./lib/noticeOps.js";
import { parseOne } from "./lib/parseOne.js";
import { isDuplicate, splitNotices } from "./lib/splitNotices.js";
import { checkModeMismatch } from "./lib/modeGuard.js";
import { buildSampleNotices } from "./lib/sampleNotices.js";
import ItemsPanel from "./components/ItemsPanel";
import DuplicateDialog from "./components/DuplicateDialog";
import { buildItems } from "./lib/noticeItems.js";
import { migrateNotice } from "./lib/noticeMigrate.js";
import { checkDuplicate } from "./lib/dedupe.js";

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
    result = result.filter(
      (n) => n.analysis && n.analysis.category === category
    );
  }
  return result;
}

function sourceLabel(source) {
  if (source === "manual") return "手动修正";
  if (source === "mixed") return "AI 辅助";
  if (source === "rule_fallback") return "本地识别";
  return "手动导入";
}

export default function Home() {
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
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notices));
    } catch (e) {
      console.warn("保存本地通知失败：", e);
    }
  }, [notices, hydrated]);

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
  const todoItems = getTodoItems(routeEvents, now);

  const selectedNotice = notices.find((n) => n.id === selectedId) ?? null;
  const displayAnalysis = selectedId
    ? selectedNotice?.analysis ?? null
    : analysis;

  function handleHighlightSpan(span) {
    const el = document.getElementById("notice-text");
    if (!el) return;
    el.focus();
    el.setSelectionRange(span.start, span.end);
    // 把选中位置滚动到可见处
    const lineHeight = 24;
    const approxTop = Math.max(
      0,
      el.value.slice(0, span.start).split(String.fromCharCode(10)).length *
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

  async function handleParse() {
    const text = noticeText.trim();
    if (!text) {
      alert("请先粘贴或输入通知原文，再点击解析。");
      return;
    }
    setSelectedId(null);

    // 单条模式先查重：命中就弹窗，别直接开跑
    if (inputMode !== "multi" && !allowDuplicate) {
      const dup = checkDuplicate(text, notices);
      if (dup && dup.type !== "none") {
        setDuplicate(dup);
        return;
      }
    }

    // 多通知先弹窗确认分法，不直接开跑。
    // 切不出来也要弹，闷声不响用户以为程序坏了。
    if (inputMode === "multi") {
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
    const result = await parseOne(text);
    const withItems = {
      ...result.analysis,
      items: buildItems(text),
    };
    setAnalysis(withItems);
    setDirty(false);
    setParsing(false);
  }

  function handleDuplicateView(notice) {
    setDuplicate(null);
    handleSelect(notice.id);
  }

  function handleDuplicateImport() {
    // 放行状态一直保留到保存完成，避免保存时二次查重
    setAllowDuplicate(true);
    setDuplicate(null);
    handleParse();
  }

  function handleDuplicateCancel() {
    setDuplicate(null);
  }

  async function handleConfirmSplit(kept) {
    setSplitDialog({ open: false, items: [], reason: "" });
    setParsing(true);
    const results = [];
    for (const t of kept) {
      if (isDuplicate(t, notices)) {
        results.push({ text: t, status: "duplicate", analysis: null, errorMsg: "" });
        continue;
      }
      try {
        const r = await parseOne(t);
        const src = r.analysis._source;
        results.push({
          text: t,
          status: src === "rule_fallback" ? "fallback" : "success",
          analysis: r.analysis,
          errorMsg: r.error ? String(r.error.message || r.error.code || "") : "",
        });
      } catch (e) {
        results.push({
          text: t,
          status: "error",
          analysis: null,
          errorMsg: String(e?.message || e),
        });
      }
    }
    setBatchResults(results);
    setParsing(false);
  }

  async function handleParseAsSingle() {
    setSplitDialog({ open: false, items: [], reason: "" });
    setInputMode("single");
    setParsing(true);
    const singleText = noticeText.trim();
    const result = await parseOne(singleText);
    const withItems = {
      ...result.analysis,
      items: buildItems(singleText),
    };
    setAnalysis(withItems);
    setDirty(false);
    setParsing(false);
  }

  const batchSavable = batchResults.filter(
    (it) =>
      (it.status === "success" || it.status === "fallback") && it.analysis
  ).length;

  function handleSave() {
    // 原文改过还没重解析，不许存
    if (dirty) return;
    if (inputMode === "multi") {
      handleBatchSave(
        batchResults
          .filter(
            (it) =>
              (it.status === "success" || it.status === "fallback") &&
              it.analysis
          )
          .map((it) => ({ text: it.text, analysis: it.analysis }))
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
      items: analysis.items || buildItems(noticeText),
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
        if (isDuplicate(item.text, seen)) continue;
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
    const samples = buildSampleNotices(Date.now());
    setNotices(samples);
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

  function handleDismissWarning() {
    setWarningDismissed(true);
  }

  const leftWidth = activeTab === "calendar" ? "360px" : "260px";
  const showEmptyState = hydrated && notices.length === 0;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        parsing={parsing}
        onOpenShare={() => setShowShare(true)}
      />

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: leftWidth + " 1fr" }}
      >
          <div className="min-h-0 overflow-hidden">
            {activeTab === "todo" && <TodoList items={todoItems} now={now} />}
            {activeTab === "calendar" && (
              <CalendarView notices={filtered} now={now} />
            )}
            {activeTab === "all" && (
              <NoticeList
                notices={filtered}
                selectedId={selectedId}
                onSelect={handleSelect}
                onDelete={handleDelete}
                hydrated={hydrated}
              />
            )}
          </div>

        <div className="flex min-h-0 flex-col">
          <div
            className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70"
            style={{ height: "45%", minHeight: "300px" }}
          >
            <div className="w-full min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
                {dirty && (
                  <div
                    className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
                    title="请先重新解析"
                  >
                    内容已修改，待重新解析
                  </div>
                )}
                <NoticeInput
                  value={noticeText}
                  onChange={handleTextChange}
                  onParse={handleParse}
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
                  mode={inputMode}
                  onModeChange={handleModeChange}
                  warning={warning}
                  onDismissWarning={handleDismissWarning}
                  onSwitchMode={handleSwitchMode}
                  showEmptyState={showEmptyState}
                  onLoadSamples={handleLoadSamples}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {inputMode === "multi" && batchResults.length > 0 ? (
              <MultiResultPanel items={batchResults} />
            ) : (
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
            )}
          </div>
        </div>
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

      {showShare && (
        <ShareDialog
          notices={notices}
          now={now}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}