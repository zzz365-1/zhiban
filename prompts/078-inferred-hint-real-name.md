# 078 续 077 用本机核实的真实导出名

## 背景

077 给的开关逻辑方向对，但它猜了一个库里不存在的函数名，
还把导入路径指向了另一个文件。本机核对后把原文事实喂回去，
让它自己出一版能直接落地的片段。

## 本机已核验事实

`app/lib/aiExtract.js` 里是 `export function isFuzzyDate(s, now = new Date()) {`。
`app/components/AnalysisPanel.js` 里已有
`import { shortParseErrorLabel, describeParseError } from "../lib/aiExtract.js";`。
全库没有 `isLooseDateText`，`deadline.js` 里也没有模糊日期判断函数。

## Prompt

```
接着上一版说。我本机核对了一下，你给的导入名和路径对不上，贴进去会直接报错。

那个判断日期是不是模糊说法的函数，真实名字叫 isFuzzyDate，是从 lib 里的 aiExtract 那个文件导出的，不是从 deadline 那个文件导出的，库里也没有叫 isLooseDateText 的函数。界面组件本来就从 aiExtract 那个文件导入了两个函数，能不能把新函数补进那一条已有的导入语句里，别新开一条。

开关那一行照上一版写的加就行，只是调用的函数名换成真实的 isFuzzyDate。

我本机跑过这个函数，下周三和明天判真，2026年11月11日和11月5日判假，正好能用。

其余要求不变。待确认那句提示一个字都不要动，别动解析抽取事项，只改这一个开关和导入。只给我需要改的那几段代码，标明文件路径和要替换的原文，不要输出整份文件。

改完我本机跑全量回归，跑不过再回来找你。
```
