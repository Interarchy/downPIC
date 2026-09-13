import { readFile } from 'node:fs/promises';
import { PRINCIPLE, PRINCIPLE_TITLE, SECTION_TITLES } from './prompt-model.mjs';

// 模型指令与模型输出之间的契约层。
//
// 指令正文只存在于 analysis-instructions.md 一处，用显式围栏标出「发给模型的部分」，
// 避免文档与代码各存一份而漂移。围栏外的人类元信息（状态行等）不进 prompt。
//
// 输出契约用「文本 + 【】解析」而不是 JSON：指令第 33 行明确要求不要嵌套列表或表格，
// 输出本身是中文散文；且被 max_tokens 截断时，文本能救回前几项，截断的 JSON 无法部分恢复。

export const SYSTEM_FENCE = {
  start: '<!-- model:system:start -->',
  end: '<!-- model:system:end -->',
};

const TITLE_PATTERN = /【([^】]{1,20})】/g;
const MIN_SECTIONS = 4; // 指令允许省略【环境与配景】等项，不强制 8 项齐全

export class AnalysisFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalysisFormatError';
    this.code = 'ANALYSIS_FORMAT_INVALID';
  }
}

export function extractSystemPrompt(markdown) {
  const start = markdown.indexOf(SYSTEM_FENCE.start);
  const end = markdown.indexOf(SYSTEM_FENCE.end);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`analysis-instructions.md 缺少 ${SYSTEM_FENCE.start} / ${SYSTEM_FENCE.end} 围栏`);
  }
  const body = markdown.slice(start + SYSTEM_FENCE.start.length, end).trim();
  if (!body) throw new Error('analysis-instructions.md 的围栏之间是空的');
  return body;
}

export async function loadSystemPrompt(url = new URL('./analysis-instructions.md', import.meta.url)) {
  return extractSystemPrompt(await readFile(url, 'utf8'));
}

// 把模型返回的散文切成 { title, text }[]。只认【】包裹的标题，
// 标题之前的开场白自然被丢弃；不认识的标题保留在结果里，由 assembleSections 过滤。
export function parseSections(text) {
  const cleaned = String(text ?? '').replace(/```[a-zA-Z]*\s*/g, '');
  const matches = [...cleaned.matchAll(TITLE_PATTERN)];
  const sections = [];

  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].index + matches[i][0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
    const body = cleaned.slice(bodyStart, bodyEnd).trim();
    if (body) sections.push({ title: matches[i][1].trim(), text: body });
  }

  return sections;
}

// 把模型输出装配成 UI 直接可渲染的形状，与 sectionsFor() 的返回结构一致，
// 这样 renderOutput() / serializePrompt() / #copy-all 都不需要改。
//
// 关键：首段永远取自代码常量 PRINCIPLE，不信任模型。
// 实测模型会自己 echo 一整段【整体生成准则】，且多带一句文档里的补充说明——
// 那会破坏 prompt-model.test.mjs 断言的复制文本格式，也会让用户拿到未经批准的版本。
export function assembleSections(modelSections, { minSections = MIN_SECTIONS } = {}) {
  const collected = new Map();

  for (const section of modelSections ?? []) {
    const title = String(section?.title ?? '').trim();
    const text = String(section?.text ?? '').trim();
    if (!text) continue;
    if (title === PRINCIPLE_TITLE) continue; // 模型 echo 的首段一律丢弃
    if (!SECTION_TITLES.includes(title)) continue; // 防模型自造分项
    if (!collected.has(title)) collected.set(title, text); // 同名取首个
  }

  const ordered = SECTION_TITLES.filter(title => collected.has(title))
    .map(title => ({ title, text: collected.get(title) }));

  if (ordered.length < minSections) {
    throw new AnalysisFormatError(
      `模型只返回了 ${ordered.length} 个有效分项，少于要求的 ${minSections} 个`,
    );
  }

  return [{ title: PRINCIPLE_TITLE, text: PRINCIPLE }, ...ordered];
}
