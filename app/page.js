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
import ItemsPanel from "./components/ItemsPanel";
import DuplicateDialog from "./components/DuplicateDialog";
import { buildDeadlineDate } from "./lib/deadline.js";
import { getTodoItems } from "./lib/todo.js";
import { updateNoticeAnalysis } from "./lib/noticeOps.js";
import { parseOne } from "./lib/parseOne.js";
import { isDuplicate, splitNotices } from "./lib/splitNotices.js";
import { checkModeMismatch } from "./lib/modeGuard.js";
import { buildSampleNotices } from "./lib/sampleNotices.js";
import { migrateNotices } from "./lib/noticeMigrate.js";
import { buildItems, applyItemPatch } from "./lib/noticeItems.js";
import { checkDuplicate, dedupeItems } from "./lib/dedupe.js";

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
  // 事项是后加的一层，一条通知可以有好几件事。
  // 和 analysis 分开存，analysis 保留原来的扁平字段，老数据不丢。
  const [items, setItems] = useState([]);
  // 原文改过之后旧结果就不是这次原文的结果了，标出来重新解析，不能继续当有效值用。
  const [dirty, setDirty] = useState(false);
  // 通知发布日期。相对日期明天这类说法靠它换算，没有它就不换算。
  const [publishedAt, setPublishedAt] = useState("");
  const [duplicate, setDuplicate] = useState({ open: false, type: "", notice: null });
  // 用户看过重复提示后仍然要导入，这一条放行一次，下一条重新拦。
  const [allowDuplicate, setAllowDuplicate] = useState(false);
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
        // 老数据没有事项，读进来的时候补出来，原有字段一条不动。
        if (Array.isArray(parsed)) setNotices(migrateNotices(parsed));
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
  // 选中已保存的通知就看它的事项，没选中就看刚解析出来的那一份。
  // 列表选中项 详情 原文 解析结果必须指同一条通知，不能各看各的。
  const displayItems = selectedId
    ? selectedNotice?.items ?? []
    : items;

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
    // 点已保存的通知就是要看这条的详情。
    // 批量模式的残留结果和模式切换提示都得清掉，不然详情还没看到先弹一个框。
    setBatchResults([]);
    setSplitDialog({ open: false, items: [], reason: "" });
    setInputMode("single");
    setWarningDismissed(true);
    setWarningCandidate(null);
    setSelectedId(id);
    setNoticeText(target.text);
    setAnalysis(target.analysis);
    setItems(target.items || []);
    setPublishedAt(target.publishedAt || "");
    setDirty(false);
  }

  function handleDelete(id) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setNoticeText("");
      setAnalysis(null);
    }
  }

  async function handleParse(options) {
    const text = noticeText.trim();
    const bypass =
      Boolean(options && options.bypassDuplicate === true) || allowDuplicate;
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

    // 重复导入先拦一道。正文一样会提示已经导入过，
    // 标题一样正文不一样会提示标题重复，由用户决定要不要再导一条。
    if (!bypass) {
      const dup = checkDuplicate(text, notices);
      if (dup.type !== "none") {
        setDuplicate({ open: true, type: dup.type, notice: dup.notice });
        return;
      }
    }
    // 用户明确选了仍然导入，这个放行要留到保存那一关。
    // 不然解析完再点保存又会被同一个提示拦一次，来回弹。
    if (!(options && options.bypassDuplicate === true)) setAllowDuplicate(false);

    setParsing(true);
    const result = await parseOne(text, { publishedAt: publishedAt || null });
    setAnalysis(result.analysis);
    setItems(result.items || []);
    setDirty(false);
    setParsing(false);
  }

  async function retryParse() {
    await handleParse({ bypassDuplicate: true });
  }

  async function handleConfirmSplit(kept) {
    setSplitDialog({ open: false, items: [], reason: "" });
    setParsing(true);
    const results = [];
    for (const t of kept) {
      if (isDuplicate(t, notices)) {
        results.push({
          text: t,
          status: "duplicate",
          analysis: null,
          items: [],
          errorMsg: "这条已经导入过，已跳过",
        });
        continue;
      }
      try {
        const r = await parseOne(t, { publishedAt: publishedAt || null });
        const src = r.analysis._source;
        results.push({
          text: t,
          status: src === "rule_fallback" ? "fallback" : "success",
          analysis: r.analysis,
          items: r.items || [],
          errorMsg: r.error ? String(r.error.message || r.error.code || "") : "",
        });
      } catch (e) {
        results.push({
          text: t,
          status: "error",
          analysis: null,
          items: [],
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
    const result = await parseOne(noticeText.trim(), {
      publishedAt: publishedAt || null,
    });
    setAnalysis(result.analysis);
    setItems(result.items || []);
    setDirty(false);
    setParsing(false);
  }

  const batchSavable = batchResults.filter(
    (it) =>
      (it.status === "success" || it.status === "fallback") && it.analysis
  ).length;

  function handleSave(options) {
    const bypass =
      Boolean(options && options.bypassDuplicate === true) || allowDuplicate;

    if (inputMode === "multi") {
      handleBatchSave(
        batchResults
          .filter(
            (it) =>
              (it.status === "success" || it.status === "fallback") &&
              it.analysis
          )
          .map((it) => ({
            text: it.text,
            analysis: it.analysis,
            items: it.items || [],
          }))
      );
      setBatchResults([]);
      return;
    }
    if (!analysis || selectedId) return;

    // 保存前再查一次。解析之后又导入过一遍的情况也得拦住，
    // 不然同一件事会在日历里出现两次。
    if (!bypass) {
      const dup = checkDuplicate(noticeText, notices);
      if (dup.type !== "none") {
        setDuplicate({ open: true, type: dup.type, notice: dup.notice });
        return;
      }
    }
    setAllowDuplicate(false);

    const deadlineDate = buildDeadlineDate(analysis.deadline, analysis.time);
    const notice = {
      id: makeId(),
      title: analysis.title || deriveTitle(noticeText),
      source: sourceLabel(analysis._source),
      text: noticeText,
      analysis,
      items: dedupeItems(items),
      publishedAt: publishedAt || null,
      schemaVersion: 2,
      deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
      savedAt: Date.now(),
    };
    setNotices((prev) => [notice, ...prev]);
    setSelectedId(notice.id);
    setDirty(false);
    // 一次性放行用完就收，下一条通知重新按重复规则拦。
    setAllowDuplicate(false);
  }

  function handleUpdateAnalysis(patch) {
    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) => {
          if (n.id !== selectedId) return n;
          const next = updateNoticeAnalysis(n, patch);
          // 手动改了字段，事项里对应的那一项要跟着改，不能一边改了一边没改。
          return { ...next, items: applyItemPatch(n.items || [], patch) };
        })
      );
      setItems((prev) => applyItemPatch(prev, patch));
    } else {
      setAnalysis((prev) =>
        prev ? { ...prev, ...patch, _source: "manual" } : prev
      );
      setItems((prev) => applyItemPatch(prev, patch));
    }
  }

  // 事项办理状态。点到哪算哪，存进通知里。
  function handleProgressChange(seq, progress) {
    const applyOne = (list) =>
      (list || []).map((it) => (it.seq === seq ? { ...it, progress } : it));

    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId ? { ...n, items: applyOne(n.items) } : n
        )
      );
    }
    setItems((prev) => applyOne(prev));
  }

  // 发布日期是相对日期的基准。改了它就得按新基准重算一遍事项。
  function handlePublishedAtChange(value) {
    setPublishedAt(value);
    const rebuilt = buildItems(noticeText, { publishedAt: value || null });
    setItems(rebuilt);
    setDirty(false);
    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId
            ? { ...n, publishedAt: value || null, items: rebuilt }
            : n
        )
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
          items: dedupeItems(item.items || []),
          publishedAt: publishedAt || null,
          schemaVersion: 2,
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
    setItems([]);
    setDirty(false);
    setPublishedAt("");
  }

  function handleTextChange(text) {
    setNoticeText(text);
    // 原文动了，上一次多通知的结果就是旧的，继续显示会误导。
    if (batchResults.length > 0) setBatchResults([]);

    // 原文一动，旧结果和旧定位都不作数。
    // 标成待重新解析，界面把它压暗并禁止点依据，逼用户重新解析而不是拿旧值当真。
    if ((analysis || items.length > 0) && !dirty) setDirty(true);

    // 选中的那条通知被改了内容，就不再是那条通知了。
    // 不解除选中的话，新通知会一直挂着上一条的已保存状态。
    if (selectedId) {
      const cur = notices.find((n) => n.id === selectedId);
      if (!cur || cur.text !== text) {
        setSelectedId(null);
        setPublishedAt("");
      }
    }
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
                <NoticeInput
                  value={noticeText}
                  onChange={handleTextChange}
                  onParse={handleParse}
                  onSave={handleSave}
                  canSave={
                    inputMode === "multi"
                      ? batchSavable > 0 && !parsing
                      : Boolean(analysis) && !selectedId && !parsing && !dirty
                  }
                  saveLabel={
                    parsing
                      ? "解析中…"
                      : dirty
                      ? "请先重新解析"
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
                items={displayItems}
                stale={dirty}
                publishedAt={publishedAt}
                onPublishedAtChange={handlePublishedAtChange}
                onProgressChange={handleProgressChange}
                onUpdate={handleUpdateAnalysis}
                onFieldClick={handleHighlightSpan}
                onRetry={retryParse}
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

      {duplicate.open && (
        <DuplicateDialog
          open={duplicate.open}
          type={duplicate.type}
          title={duplicate.notice ? duplicate.notice.title : ""}
          onClose={() => setDuplicate({ open: false, type: "", notice: null })}
          onView={() => {
            const n = duplicate.notice;
            setDuplicate({ open: false, type: "", notice: null });
            if (n) handleSelect(n.id);
          }}
          onSkip={() =>
            setDuplicate({ open: false, type: "", notice: null })
          }
          onImportAnyway={() => {
            setDuplicate({ open: false, type: "", notice: null });
            // 仍然导入就是要按当前这份原文再解析一遍存成新通知。
            // 不能拿上一条通知的解析结果充当这一条的，那就成了静默串台。
            setAllowDuplicate(true);
            retryParse();
          }}
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