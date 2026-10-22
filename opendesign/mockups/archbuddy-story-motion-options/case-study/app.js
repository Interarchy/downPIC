(() => {
  'use strict';
  const steps = [
    {
      title: '先让素材有归属。',
      description: '采集与导入进入同一图词库，按项目组织。',
      action: '采集公共建筑参考，或导入已有案例文件夹。',
      reason: '先衔接已有的浏览与归档习惯，降低开始使用的成本。',
      asset: '图片、项目归属与本地索引。',
      image: '01-project-library-1280x800.png', label: '插件内完整图词库',
      caption: 'V4 实际界面，使用独立演示数据；点击可放大。'
    },
    {
      title: '用画面线索找回图。',
      description: '关键词先响应，主动搜索后补充语义候选。',
      action: '描述想找的空间、材料或氛围，再查看候选图片与详情。',
      reason: '“记得画面”是设计师已有的信息，搜索应当承接这类线索。',
      asset: '可修正的描述与本地向量索引。',
      image: '02-image-description-1280x800.png', label: '图片详情与可编辑描述',
      caption: '此图展示描述详情；不模拟语义命中结果或检索质量。'
    },
    {
      title: '只借鉴需要的部分。',
      description: '最多三张参考图，按体量、材料、光线选择组合。',
      action: '保留山地建筑的体量，借鉴另一张参考的木质材料，编辑后整体确认。',
      reason: '将“看到了什么”与“想采用什么”分开，避免整段反推替用户做决定。',
      asset: '已确认 Prompt 与对应的参考来源。',
      image: '04-prompt-builder-1280x800.png', label: '侧栏提示词生成',
      caption: '真实侧栏界面组合截图；建筑素材与 Prompt 为手工演示。'
    },
    {
      title: '围绕目标，定位偏差。',
      description: '导回外部生成图，对照已确认的 Prompt 逐项评估。',
      action: '查看“符合 / 部分符合 / 明显偏差 / 无法判断”，决定是否修改对应维度。',
      reason: '评估基准是用户选定的目标。生成图无需照搬原参考图的全部特征。',
      asset: '定位偏差的依据，以及待确认的修改方向。',
      image: '05-prompt-optimization-1280x800.png', label: '效果图导入与评估入口',
      caption: '截图展示实际评估入口，未填入虚构模型评估结果。'
    },
    {
      title: '让下一次不必重来。',
      description: '保留来源与确认版本，下次从已有方案继续。',
      action: '确认修改，保存新版本；下次从已有方案继续编辑。',
      reason: '近期入口与长期保留分开设计：侧栏显示最近记录，图词库保留全部确认版本。',
      asset: '有来源、可追溯、可继续编辑的 Prompt 版本。',
      image: '03-prompt-library-1280x800.png', label: '提示词库与版本回看',
      caption: 'V4 实际词库界面；演示版本用于展示信息组织。'
    }
  ];
  const stepButtons = [...document.querySelectorAll('[data-step]')];
  function selectStep(index, updateHash = true) {
    const step = steps[index];
    if (!step || !stepButtons.length) return;
    stepButtons.forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    const values = {'step-title':step.title,'step-description':step.description,'step-action':step.action,'step-reason':step.reason,'step-asset':step.asset,'screen-label':step.label,'workflow-caption':step.caption};
    Object.entries(values).forEach(([id,value]) => { document.getElementById(id).textContent = value; });
    const shot = document.getElementById('workflow-image');
    shot.src = 'assets/' + step.image;
    shot.alt = 'ArchBuddy ' + step.label + '实际界面';
    if (updateHash) history.replaceState(null, '', '#step-' + (index + 1));
  }
  stepButtons.forEach(button => button.addEventListener('click', () => selectStep(Number(button.dataset.step))));
  const initialStep = /^#step-([1-5])$/.exec(location.hash);
  if (initialStep) selectStep(Number(initialStep[1]) - 1, false);

  const decisionButtons = [...document.querySelectorAll('[data-decision]')];
  function selectDecision(key, updateHash = true) {
    if (!decisionButtons.some(button => button.dataset.decision === key)) return;
    decisionButtons.forEach(button => button.setAttribute('aria-selected', String(button.dataset.decision === key)));
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== key; });
    if (updateHash) history.replaceState(null, '', '#' + key);
  }
  decisionButtons.forEach(button => button.addEventListener('click', () => selectDecision(button.dataset.decision)));
  if (decisionButtons.length && location.hash) selectDecision(location.hash.slice(1), false);

  const material = document.getElementById('material-select');
  const materials = {concrete:'浅灰混凝土，保留细腻纹理。',wood:'温暖木饰面，保留清晰的竖向木纹。',brick:'红砖与细框玻璃，建立细密的立面节奏。'};
  if (material) material.addEventListener('change', () => {
    document.getElementById('material-output').textContent = materials[material.value];
  });

  const frictionNotes = {
    find: ['找不到', '记得画面，却忘了文件名。把视觉特征转成可检索的描述。'],
    express: ['说不清', '喜欢一张图，却只想借鉴一部分。按体量、材料、光线选择并组合。'],
    reuse: ['接不上', '图和修改记录散落各处。保留来源与确认版本，让下一次能够继续。']
  };
  document.querySelectorAll('[data-friction]').forEach(button => {
    button.addEventListener('click', () => {
      const note = frictionNotes[button.dataset.friction];
      document.querySelectorAll('[data-friction]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      document.getElementById('friction-key').textContent = note[0];
      document.getElementById('friction-description').textContent = note[1];
    });
  });
  const dialog = document.querySelector('.lightbox');
  document.querySelectorAll('[data-enlarge]').forEach(button => button.addEventListener('click', () => {
    const source = document.getElementById('workflow-image');
    if (!source || !dialog) return;
    const large = dialog.querySelector('img');
    large.src = source.src;
    large.alt = source.alt;
    dialog.showModal();
  }));
  const close = document.querySelector('[data-close-lightbox]');
  if (close) close.addEventListener('click', () => dialog.close());
  if (dialog) dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
})();