import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ArchitectureImageAnalyzer, validateAnalysisResult } from './analyzer.mjs';

export const PRESET_KEYWORDS = [
  '展览空间', '阅览空间', '庭院', '中庭', '步廊', '入口空间', '公共空间', '交通空间',
  '清水混凝土', '木构', '砖', '石材', '玻璃', '金属', '钢结构',
  '山地', '林地', '滨水', '自然采光', '静谧', '通透', '温暖', '纪念性',
];

const mimeTypes = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif'],
]);

function completionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.find((item) => item.type === 'text')?.text || '';
  return '';
}

function normalizeBaseUrl(value) {
  return String(value || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
}

function parseAndValidate(text) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const payload = JSON.parse(normalized);
  const result = validateAnalysisResult(payload);
  const unsupportedPreset = result.keywords.filter((keyword) => !PRESET_KEYWORDS.includes(keyword));
  if (unsupportedPreset.length) throw new Error(`千问将非预设词放入了预设关键词：${unsupportedPreset.join('、')}`);
  const presetKeywords = result.keywords.slice(0, 8);
  if (!Array.isArray(payload.new_keywords) || payload.new_keywords.some((keyword) => typeof keyword !== 'string')) {
    throw new Error('千问返回的新增关键词格式不正确');
  }
  const newKeywords = [...new Set(payload.new_keywords.map((keyword) => keyword.trim().replace(/\s+/g, ' ')).filter(Boolean))];
  if (newKeywords.length > 5) throw new Error('千问单张图片最多自主新增 5 个标签');
  if (newKeywords.some((keyword) => keyword.length > 12)) throw new Error('千问新增标签名称不能超过 12 个字符');
  if (newKeywords.some((keyword) => PRESET_KEYWORDS.includes(keyword) || presetKeywords.includes(keyword))) {
    throw new Error('千问新增标签与已有预设标签重复');
  }
  return { ...result, keywords: [...presetKeywords, ...newKeywords], newKeywords };
}

export class QwenArchitectureAnalyzer extends ArchitectureImageAnalyzer {
  constructor({ apiKey, model = 'qwen3.7-plus', baseUrl, fetchImpl = globalThis.fetch } = {}) {
    super();
    if (!apiKey) throw new Error('开发者千问服务凭据尚未配置');
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
  }

  async analyze(asset) {
    const mimeType = mimeTypes.get(path.extname(asset.managedPath).toLowerCase());
    if (!mimeType) throw new Error('图片格式不受千问视觉分析支持');
    const imageBuffer = await readFile(asset.managedPath);
    if (imageBuffer.byteLength > 20 * 1024 * 1024) throw new Error('图片超过千问 Base64 输入的 20MB 限制');
    const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    const outputShape = '{"description":"一至三句中文建筑空间描述","keywords":["从预设词库选择的标签"],"new_keywords":["AI自主新增标签"]}';
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        enable_thinking: false,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `你是建筑图片资料管理员。只分析图片中可见的空间、材料、构造、形态与氛围，不依据网页标题臆测不可见事实。必须只输出合法 JSON，不要输出解释或 Markdown。JSON 结构必须为：${outputShape}`,
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              {
                type: 'text',
                text: `生成一至三句便于自然语言检索的中文描述。优先从以下预设中选择最相关的 2 至 6 个标签，放入 keywords：${PRESET_KEYWORDS.join('、')}。如果预设仍无法充分表达图片，可以自主新增 0 至 5 个准确、简短且不与预设近义重复的建筑标签，放入 new_keywords；没有必要新增时返回空数组。项目类型仅作弱提示：${asset.project_type}；项目名称仅作弱提示：${asset.project_name}。以 JSON 返回。`,
              },
            ],
          },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `千问 API 请求失败（${response.status}）`);
    const text = completionText(payload);
    if (!text) throw new Error('千问未返回可解析的图片描述');
    return parseAndValidate(text);
  }
}
