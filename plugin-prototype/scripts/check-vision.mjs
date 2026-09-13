import { readFile } from 'node:fs/promises';
import { loadSystemPrompt } from '../analysis-contract.mjs';
import { resolveUpstreamModel } from '../vision-analyzer.mjs';
import { decodePng, cropPng, encodePng, cropRectFor } from './png-tools.mjs';

// Step 0 冒烟脚本：用真实参考图打一次真实模型请求，回答三件事——
//   1. 端点与鉴权头的确切组合
//   2. max_tokens 能开多大（截断会丢尾部【】分项）
//   3. 模型对 analysis-instructions.md 的格式遵从度
// 结论决定 Step 1 的输出契约用「文本+【】解析」还是退回 JSON。
//
// 用法：DEEPSEEK_API_KEY=sk-... node plugin-prototype/scripts/check-vision.mjs [裁剪序号]

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/anthropic';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
const UPSTREAM_MODEL = resolveUpstreamModel(MODEL, BASE_URL);
const MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS || 8192);
const CROP_INDEX = Number(process.argv[2] ?? 0);

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('缺少 DEEPSEEK_API_KEY。用法：DEEPSEEK_API_KEY=sk-... node plugin-prototype/scripts/check-vision.mjs');
  process.exit(1);
}

function extractText(payload) {
  const blocks = payload?.content ?? [];
  const kinds = blocks.map(block => block.type);
  const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('\n');
  return { kinds, text };
}

function reportSections(text) {
  const titles = [...text.matchAll(/【([^】]{1,20})】/g)].map(match => match[1]);
  console.log(`  分项标题（${titles.length} 个）：${titles.join(' / ') || '（一个都没找到）'}`);
  console.log(`  正文长度：${text.length} 字`);
  return titles;
}

const sheet = decodePng(await readFile(new URL('../../prototype/assets/architecture-board.png', import.meta.url)));
const rect = cropRectFor(CROP_INDEX, sheet.width, sheet.height, 3, 2);
const crop = cropPng(sheet, rect);
const cropPngBytes = encodePng(crop);

console.log(`源图 ${sheet.width}x${sheet.height} → 裁切 #${CROP_INDEX} ${rect.width}x${rect.height}+${rect.x}+${rect.y}`);
console.log(`编码后 ${cropPngBytes.length} 字节（base64 约 ${Math.ceil(cropPngBytes.length / 3) * 4}）`);

// 与线上同一条路径：围栏之间的内容才是发给模型的部分。
const system = await loadSystemPrompt();
console.log(`system prompt ${system.length} 字`);
console.log(`产品模型 ${MODEL} → 上游模型 ${UPSTREAM_MODEL} @ ${BASE_URL}，max_tokens=${MAX_TOKENS}\n`);

const started = Date.now();
let response;
try {
  response = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      authorization: `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: UPSTREAM_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: cropPngBytes.toString('base64') } },
          { type: 'text', text: '分析这张参考图，按要求输出中文结构化生图提示词。' },
        ],
      }],
    }),
  });
} catch (error) {
  console.error(`请求失败：${error.message}`);
  process.exit(1);
}

// 计时必须在读完 body 之后——fetch 只等到响应头，而生成耗时全在 body 流里。
const payload = await response.json();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`HTTP ${response.status}　耗时 ${elapsed}s　stop_reason=${payload.stop_reason}`);
console.log(`usage: ${JSON.stringify(payload.usage ?? {})}`);

if (!response.ok) {
  console.log(`错误：${JSON.stringify(payload.error ?? payload)}`);
  process.exit(1);
}

const { kinds, text } = extractText(payload);
console.log(`content 块类型：${kinds.join(' + ') || '（空）'}`);

if (!text) {
  console.log('没有 text 块——需要调整提取逻辑。');
  process.exit(1);
}

if (payload.stop_reason === 'max_tokens') {
  console.log('⚠ 被 max_tokens 截断，尾部【】分项已丢失。需要提高上限。');
}

console.log('\n--- 模型输出 ---');
console.log(text);
console.log('\n--- 格式遵从度 ---');
reportSections(text);
