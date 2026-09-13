const REQUIRED_RESULT_KEYS = ['description', 'keywords'];

export function validateAnalysisResult(result) {
  if (!result || typeof result !== 'object') throw new TypeError('AI 分析结果必须是对象');
  for (const key of REQUIRED_RESULT_KEYS) {
    if (!(key in result)) throw new TypeError(`AI 分析结果缺少 ${key}`);
  }
  if (typeof result.description !== 'string' || !result.description.trim()) throw new TypeError('图片描述不能为空');
  if (!Array.isArray(result.keywords) || result.keywords.some((item) => typeof item !== 'string')) throw new TypeError('关键词必须是字符串数组');
  return {
    description: result.description.trim(),
    keywords: [...new Set(result.keywords.map((item) => item.trim()).filter(Boolean))],
  };
}

export class ArchitectureImageAnalyzer {
  async analyze() {
    throw new Error('ArchitectureImageAnalyzer.analyze 必须由具体模型适配器实现');
  }
}

// 仅用于验证队列和数据写回，不代表模型看过图片。
export class MockArchitectureAnalyzer extends ArchitectureImageAnalyzer {
  async analyze(asset) {
    return validateAnalysisResult({
      description: `来自“${asset.projectName}”的建筑参考图片，等待接入真实视觉模型后生成空间、材料与氛围描述。`,
      keywords: [asset.projectType, '待模型复核'],
    });
  }
}
