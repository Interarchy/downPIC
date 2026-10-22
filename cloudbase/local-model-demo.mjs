import { V2_MODULE_DEFINITIONS } from '../plugin-prototype/analysis-contract.mjs';

const note = '【本地演示】此内容仅用于验证登录与积分流程，未分析图片，也未请求真实模型。';
const metadata = { model: 'archbuddy-local-demo', durationMs: 20, truncated: false, usage: null };
const modules = () => V2_MODULE_DEFINITIONS.map(item => ({ ...item, value: `${note}${item.title}示例。`, basis: 'uncertain', evidence: note, confidence: 'unknown' }));
export function createLocalMockAnalyzer() {
  return {
    async analyze() { return { ...metadata, sections: [{ title: '场景与主体', text: note }, { title: '视角与构图', text: note }, { title: '材料与表面', text: note }, { title: '光照与氛围', text: note }] }; },
    async analyzeV2() { return { ...metadata, modules: modules() }; },
    async describe() { return { ...metadata, description: `${note}建筑外观、空间、材料与光线的演示描述。` }; },
    async semanticSearch({ documents }) { return { ...metadata, matches: documents.slice(0, 3).map(item => ({ id: item.id, score: 0.7 })) }; },
    async evaluate({ requestId, evaluationId, target }) {
      return { ...metadata, evaluation: { contractVersion: 3, requestId, evaluationId, overallConclusion: note,
        findings: target.modules.map(item => ({ key: item.key, status: 'unknown', observation: note, gap: '演示结果不判断真实图片偏差。', suggestion: '请在后续接入真实模型后验证图片效果。', reliabilityNote: note })) } };
    },
  };
}
