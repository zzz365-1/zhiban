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
import { updateNoticeAnalysis } from "./lib/noticeOps.js";
import { parseOne } from "./lib/parseOne.js";
import { isDuplicate, splitNotices } from "./lib/splitNotices.js";
import { checkModeMismatch } from "./lib/modeGuard.js";
import { buildSampleNotices } from "./lib/sampleNotices.js";

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setNotices(parsed);
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
  const todoItems = getTodoItems(filtered, now);

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
    setAnalysis(result.analysis);
    setParsing(false);
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
    const result = await parseOne(noticeText.trim());
    setAnalysis(result.analysis);
    setParsing(false);
  }

  const batchSavable = batchResults.filter(
    (it) =>
      (it.status === "success" || it.status === "fallback") && it.analysis
  ).length;

  function handleSave() {
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
      deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
      savedAt: Date.now(),
    };
    setNotices((prev) => [notice, ...prev]);
    setSelectedId(notice.id);
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
            style={{ height: "35%" }}
          >
            <div className="w-full min-h-0 flex-1 overflow-y-auto px-6 py-3">
              <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
                <NoticeInput
                  value={noticeText}
                  onChange={handleTextChange}
                  onParse={handleParse}
                  onSave={handleSave}
                  canSave={
                    inputMode === "multi"
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
                onFieldClick={handleHighlightSpan}
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