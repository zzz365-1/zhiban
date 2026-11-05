# 104 疑似重复的弹窗与批量保存接线

## 背景

查重模块已经能分出四档，完全一样，疑似重复，标题相同但正文不同，全新通知，
批量也能一次判定一整批与已有通知和批次内部重复。可界面还没接上这一档。
单条弹窗只有两档文案，批量结果面板只会显示与已有通知重复这一个老状态，
用户没有跳过和明确另存的选择，同批次内部重复也没人管。

## 本机已核验事实

app/lib/dedupe.js 现在导出 checkDuplicate 和 checkBatchDuplicates。
checkDuplicate 收正文和已有通知数组，返回 type 是 exact 或 similar 或 title_same 或 none，
命中时带 notice，similar 另带 score。
checkBatchDuplicates 收一批正文和已有通知数组，返回等长数组，
每项形如 { type, notice, score, withinBatch }，
withinBatch 为 true 表示命中的是同批次里排在前面的正文，
这时 notice 是只有 text 字段的包装对象，没有 id 和 title。

app/components/DuplicateDialog.js 收 duplicate，里面解构 type 和 notice，
当前按 isExact 分两支。exact 分支标题是这条通知已经存在，
按钮是查看已有和跳过。另一支标题是标题相同的通知已存在，
按钮是取消，查看已有，仍然导入。弹窗里已有通知的标题用 notice.title 显示。
四个回调是 onClose，onView，onImport，onCancel。

app/page.js 当前接线，第31行 import { checkDuplicate } from "./lib/dedupe.js";
第24行 import { isDuplicate, splitNotices } from "./lib/splitNotices.js";
第380到387行单条查重，命中就 setDuplicate 并 return，
补充通知的判断在这之前，走的是另一条弹窗流程，不要动这个顺序。
第429到434行 handleDuplicateImport 会把 allowDuplicate 置真，关弹窗再解析，这就是明确另存的放行通道。
第436到438行 handleDuplicateCancel 关弹窗，等于跳过。
第1219到1228行 DuplicateDialog 的四个回调已经接好。

第440到482行 handleConfirmSplit，当前用 isDuplicate(t, notices) 判断，
命中就 push 一条 status 是 duplicate 且 analysis 为 null 的结果，然后 continue。
第500到503行 batchSavable 只数 status 是 success 或 fallback 且有 analysis 的条数。
第505到520行 handleSave 的多通知分支，把 batchResults 里同样条件的条目
映射成 { text, analysis } 交给 handleBatchSave。
第690到732行 handleBatchSave，用 isDuplicate(item.text, seen) 二次查重，
seen 初始是 notices 的副本，每存一条就 push 进去，所以批内重复也挡得住。
第1083到1094行 MultiResultPanel 的调用处，传了 items，onSave，canSave，saveLabel。

app/components/MultiResultPanel.js 收 items，onSave，canSave，saveLabel，
第11到25行 STATUS_LABEL 和 STATUS_CLASS 里有一个 duplicate 状态。
每条结果渲染时拿 it.analysis，现在没有读重复信息。
组件内部目前没有 useState。

## 验收要点

第一，单条弹窗对疑似重复要给独立标题疑似重复通知，
说明里讲清楚正文高度相似只是少量措辞不同，
按钮要有查看已有，跳过，明确另存，明确另存走原来的 onImport 放行通道。
完全重复和标题相同那两支的行为保持原样。

第二，批量确认切分后要用新批量判定把每条的重复信息带到结果里，
与已有通知重复和同批次内部重复都要能看出来，
默认把命中的条目标成跳过，用户点明确另存才改成不跳过。

第三，批量结果面板要显示重复提示，能展开看已有那条正文，
并有跳过本条和明确另存两个按钮切换状态，
查看已有不要依赖 notice.id，因为批内命中的包装对象没有 id。

第四，跳过的条目不进入保存，通知数，待办数，日历事件和汇总条数都不会增加，
批量保存函数还要保留二次查重挡住真正完全一样的正文，
但用户已经明确另存的条目要放行。

第五，补充通知那套关联流程的判断顺序一个字不许动，
不能被新的查重挡住，也不许自动删除或覆盖任何已有通知。

第六，只输出成对改动片段，逐文件分开写，不重写整个文件，
package.json 的命令一条都不能动。

## Prompt

```
查重那边分档已经做好了，界面还没接上，我演示的时候还是分不清哪条是真重复。想请你把三处接起来。单条弹窗现在只有完全重复和标题相同两种说法，请再加一档疑似重复通知说明正文高度相似只是少量措辞不同，这一档要有查看已有，跳过，明确另存三个选择，明确另存走原来那条放行通道就行，完全重复和标题相同两支别动。批量那块更关键，确认切分的时候请用新的批量判定把每条跟已有通知比的结果，还有跟同批次前面正文比的结果都带到结果里，命中的条目默认标成跳过，用户点明确另存才改成不跳过。批量结果面板上请显示是哪一档重复，让人能展开看到已有那条正文，再放跳过本条和明确另存两个按钮切状态。这里有个坑，同批次内部命中的那条是个只有正文的包装对象，没有编号也没有标题，查看已有别去读编号，会报错。保存那边请只把没跳过的条目送进去，批量保存函数里还留一道二次查重挡住真正完全一样的正文，但用户已经明确另存的要放行，别又给拦回去。补充通知那套关联流程的判断顺序千万别动，别让它被查重挡住，也别自动删我已有的通知。我只想让跳过的条目一条数据都不增加，通知，待办，日历和汇总都一样。按文件把改前改后分别写出来，别重写整个文件。
```
