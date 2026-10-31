/**
 * DeepSeek Key 连通性自检脚本
 *
 * 用法：node scripts/check-api-key.mjs
 *
 * 作用：在动手写业务代码之前，先确认三件事
 *   1. .env.local 里的 Key 格式是否正确
 *   2. 账户余额是否大于 0（DeepSeek 为预付费，余额为 0 时调用会直接失败）
 *   3. deepseek-flash 模型能否正常返回内容
 *
 * 安全约定：本脚本只打印余额、token 消耗与返回正文，
 * 任何情况下都不打印完整的 Key。
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 第一步：读取并校验本地环境变量文件
const envPath = join(root, '.env.local')
if (!existsSync(envPath)) {
  console.error('未找到 .env.local')
  console.error('请复制 .env.example 为 .env.local，并填入你自己的 Key')
  process.exit(1)
}

const envText = readFileSync(envPath, 'utf8')
const matched = envText.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/m)

if (!matched) {
  console.error('.env.local 中没有找到 DEEPSEEK_API_KEY 这一行')
  process.exit(1)
}

const apiKey = matched[1]
const masked = apiKey.slice(0, 5) + '*'.repeat(Math.max(apiKey.length - 9, 0)) + apiKey.slice(-4)

console.log('读取到的 Key：', masked)
console.log('Key 长度：', apiKey.length, '个字符')

if (!/^sk-[A-Za-z0-9]+$/.test(apiKey)) {
  console.error('')
  console.error('Key 格式不对，正常应该以 sk- 开头，后面只跟字母和数字')
  console.error('常见原因：等号后面多了引号、空格，或者换行把 Key 截断了')
  process.exit(1)
}

console.log('格式校验通过')
console.log('')

const BASE = 'https://api.deepseek.com'
const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// 第二步：查余额，这一步不消耗额度
console.log('--- 1. 账户余额（免费查询，不消耗额度）---')
try {
  const bal = await call('/user/balance')
  if (bal.is_available === false) {
    console.error('账户不可用：', bal.err_msg ?? '未知原因')
    process.exit(1)
  }
  const info = (bal.balance_infos ?? [])[0] ?? {}
  console.log('币种：', info.currency ?? 'CNY')
  console.log('总余额：', info.total_balance ?? '未知')
  console.log('  其中充值部分：', info.topped_up_balance ?? '未知')
  console.log('  其中赠送部分：', info.granted_balance ?? '未知')
  if (Number(info.total_balance) === 0) {
    console.error('')
    console.error('余额为 0，DeepSeek 是预付费模式，需要先充值才能调用')
    process.exit(1)
  }
} catch (e) {
  console.error('余额查询失败：', e.message)
  console.error('检查网络，或确认 Key 是否正确')
  process.exit(1)
}

console.log('')

// 第三步：真实调用一次，验证模型可用
console.log('--- 2. 模型连通性实测（会产生极小费用）---')
const sample =
  '关于2026届毕业论文开题答辩的通知\n各毕业班同学：\n' +
  '2026届本科毕业论文开题答辩定于2026年11月15日17:00在图书馆三楼报告厅举行。\n' +
  '请同学们于2026年11月10日23:59前将开题报告初稿发送至邮箱 thesis@example.edu.cn，逾期不再受理。\n' +
  '答辩时需携带纸质版材料一式三份，联系人：王老师 13800000000。\n教务处\n2026年10月30日'

const started = Date.now()
let response
try {
  response = await call('/chat/completions', {
    model: 'deepseek-flash',
    messages: [
      {
        role: 'system',
        content:
          '你是高校通知解析助手。从通知中提取结构化信息，只输出 JSON，不要任何解释。' +
          '字段：title, deadline 格式为 YYYY-MM-DD HH:mm 无法提取则为 null, location, ' +
          'summary 四十字以内, category。',
      },
      { role: 'user', content: sample },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    stream: false,
  })
} catch (e) {
  console.error('调用失败：', e.message)
  process.exit(1)
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)

if (response.error) {
  console.error('接口返回错误：', response.error.message)
  if (response.error.code === 401) {
    console.error('Key 无效或已被删除')
  }
  process.exit(1)
}

const message = (response.choices ?? [{}])[0].message ?? {}
const usage = response.usage ?? {}
const detail = usage.completion_tokens_details ?? {}

console.log('耗时：', elapsed, '秒')
console.log('返回正文：')
console.log(message.content || '（正文为空）')

if (!message.content) {
  console.error('')
  console.error('返回正文为空。最常见的原因是 max_tokens 给得太小，')
  console.error('模型先在内部思考就把额度用完了，轮不到输出正式答案。')
  console.error('本项目实测需要 1000 以上，脚本里给的是 1200。')
  process.exit(1)
}

try {
  const parsed = JSON.parse(message.content)
  console.log('')
  console.log('JSON 解析成功，字段：', Object.keys(parsed).join(', '))
} catch {
  console.error('')
  console.error('返回的不是合法 JSON，后续集成时需要加清洗逻辑')
  process.exit(1)
}

console.log('')
console.log('token 消耗：输入', usage.prompt_tokens, '/ 输出', usage.completion_tokens)
console.log('其中思考占用：', detail.reasoning_tokens ?? 0, 'tokens')

// 按 DeepSeek 现行 Flash 档位估算，单位元每百万 tokens
const cost =
  ((usage.prompt_tokens ?? 0) * 0.27 + (usage.completion_tokens ?? 0) * 1.1) / 1_000_000
console.log('本次花费约：', (cost * 100).toFixed(3), '分')

console.log('')
console.log('全部通过，可以开始接入业务代码了')
