import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRINCIPLE, PRINCIPLE_TITLE, SECTION_TITLES } from '../prompt-model.mjs';
import {
  AnalysisFormatError,
  assembleSections,
  extractSystemPrompt,
  loadSystemPrompt,
  parseSections,
} from '../analysis-contract.mjs';

const instructionsUrl = new URL('../analysis-instructions.md', import.meta.url);

// 取自 2026-09-13 对 deepseek-flash 的真实调用输出，保留原样：
// 模型确实会自己 echo 一整段【整体生成准则】，而且多带一句文档里的补充说明。
const LIVE_OUTPUT = `【整体生成准则】
保持待修改原图的视角与构图不变，保留原有画幅比例、透视关系、主体位置及空间布局。参考以下视觉特征进行效果表达，输出四千像素级（4K）高分辨率图像，呈现高品质建筑效果图效果：材质细腻可信、光影自然协调、画面清晰，避免明显失真、噪点与过度锐化。

后续视角与构图分项仅描述参考图的视觉特点；用于生图时，以整体生成准则中对待修改原图的保持要求为优先。除用户指定的固定首段中"4K"外，只使用中文。

【核心视觉特征】
冷灰清水混凝土构成的几何建筑群，中央梯形高耸体量向上收分。

【场景与主体】
场景为山谷前缘的缓坡草地，建筑坐落在抬高的混凝土基座上。

【视角与构图】
接近人眼高度的正面远景，视线略低，建筑位于画面中央并占据中景。

【色彩与明暗】
以冷灰混凝土、灰绿山体和灰白天空为主，整体低饱和。

【光照与氛围】
多云漫射天光，光线柔和均匀，无明显硬阴影。

【材料与表面】
主导为浅灰清水混凝土，表面平整哑光。

【环境与配景】
前景草甸黄绿斑驳，散布稀疏幼树。

【图像表现】
写实建筑可视化与摄影感，远景深景深，建筑边缘清晰。`;

test('指令文档仍然逐字包含已批准的固定首段', async () => {
  const instructions = await readFile(instructionsUrl, 'utf8');
  assert.ok(instructions.includes(PRINCIPLE));
});

test('围栏之间是发给模型的部分，围栏外的人类元信息不进 prompt', async () => {
  const system = await loadSystemPrompt(instructionsUrl);

  assert.ok(system.includes(PRINCIPLE));
  assert.ok(system.includes('你是一名建筑、室内与景观可视化分析助手'));
  assert.ok(system.includes('以可见证据为依据，不推测不可见空间'));
  assert.ok(system.includes('不猜测项目名称、建筑师、地点、渲染软件或原始生成参数'));
  for (const title of SECTION_TITLES) assert.ok(system.includes(`【${title}】`), `缺少分项${title}`);

  assert.ok(!system.includes('状态：用户已确认内容'), '状态行是人类元信息，不该发给模型');
  assert.ok(!system.includes('model:system:'));
});

test('缺少围栏时明确报错，而不是静默发出半截指令', () => {
  assert.throws(() => extractSystemPrompt('# 只有正文\n你是一名助手。'), /缺少/);
  assert.throws(
    () => extractSystemPrompt('<!-- model:system:start -->\n<!-- model:system:end -->'),
    /围栏之间是空的/,
  );
});

test('parseSections 切出真实输出里的全部分项', () => {
  const sections = parseSections(LIVE_OUTPUT);
  assert.deepEqual(
    sections.map(section => section.title),
    [PRINCIPLE_TITLE, ...SECTION_TITLES],
  );
  assert.equal(sections[1].text, '冷灰清水混凝土构成的几何建筑群，中央梯形高耸体量向上收分。');
});

test('parseSections 能吃掉 Markdown 代码围栏，并丢弃标题前的开场白', () => {
  const wrapped = `好的，以下是我的分析：\n\n\`\`\`\n【核心视觉特征】\n暖色木质立面包围绿色庭院。\n\n【场景与主体】\n两层低层建筑围合的开放庭院。\n\`\`\``;
  const sections = parseSections(wrapped);

  assert.deepEqual(sections.map(section => section.title), ['核心视觉特征', '场景与主体']);
  assert.ok(!sections[0].text.includes('好的'));
  assert.ok(!sections[1].text.includes('```'));
});

test('assembleSections 用代码常量覆盖模型 echo 的首段', () => {
  const assembled = assembleSections(parseSections(LIVE_OUTPUT));

  assert.equal(assembled[0].title, PRINCIPLE_TITLE);
  assert.equal(assembled[0].text, PRINCIPLE, '首段必须逐字等于已批准版本');
  assert.ok(
    !assembled[0].text.includes('后续视角与构图分项仅描述'),
    '模型多带的那句补充说明必须被丢弃',
  );
  assert.equal(assembled.filter(section => section.title === PRINCIPLE_TITLE).length, 1, '首段不能重复');
});

test('assembleSections 按固定顺序排列，并过滤模型自造的分项', () => {
  const assembled = assembleSections([
    { title: '图像表现', text: '写实可视化。' },
    { title: '核心视觉特征', text: '冷灰混凝土。' },
    { title: '相机参数', text: '35mm 焦距。' },
    { title: '光影分析', text: '自造的分项。' },
    { title: '场景与主体', text: '山谷缓坡。' },
    { title: '视角与构图', text: '人眼高度。' },
  ]);

  assert.deepEqual(assembled.map(section => section.title), [
    PRINCIPLE_TITLE, '核心视觉特征', '场景与主体', '视角与构图', '图像表现',
  ]);
});

test('assembleSections 丢掉空分项，分项不足时报可识别的格式错误', () => {
  const sparse = [
    { title: '核心视觉特征', text: '冷灰混凝土。' },
    { title: '场景与主体', text: '   ' },
    { title: '视角与构图', text: '' },
  ];

  assert.throws(() => assembleSections(sparse), error => {
    assert.ok(error instanceof AnalysisFormatError);
    assert.equal(error.code, 'ANALYSIS_FORMAT_INVALID');
    assert.match(error.message, /少于要求的 4 个/);
    return true;
  });
});

test('模型完全不守格式时抛格式错误，而不是产出半成品', () => {
  for (const bad of ['', '   ', '抱歉，我无法分析这张图片。', '{"description":"没有分项"}']) {
    assert.throws(() => assembleSections(parseSections(bad)), AnalysisFormatError);
  }
});

test('装配结果与 sectionsFor() 的复制文本格式一致', async () => {
  const { sectionsFor, serializePrompt } = await import('../prompt-model.mjs');
  const assembled = serializePrompt(assembleSections(parseSections(LIVE_OUTPUT)));
  const fixture = serializePrompt(sectionsFor({ sections: [
    '冷灰清水混凝土构成的几何建筑群，中央梯形高耸体量向上收分。',
    '场景为山谷前缘的缓坡草地，建筑坐落在抬高的混凝土基座上。',
    '接近人眼高度的正面远景，视线略低，建筑位于画面中央并占据中景。',
    '以冷灰混凝土、灰绿山体和灰白天空为主，整体低饱和。',
    '多云漫射天光，光线柔和均匀，无明显硬阴影。',
    '主导为浅灰清水混凝土，表面平整哑光。',
    '前景草甸黄绿斑驳，散布稀疏幼树。',
    '写实建筑可视化与摄影感，远景深景深，建筑边缘清晰。',
  ] }));

  assert.equal(assembled, fixture, '真实模型输出装配后应与人工示例结构完全相同');
  assert.ok(assembled.startsWith(`【${PRINCIPLE_TITLE}】\n${PRINCIPLE}\n\n【核心视觉特征】`));
});
