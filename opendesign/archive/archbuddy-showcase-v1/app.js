(() => {
  'use strict';
  const imageBase = 'case-study/assets/';
  const stages = {
    capture: {label:'采集参考图',title:['看到喜欢的图，','顺手留下来。'],description:'浏览网页时采集，也能导入已有文件夹。按项目整理素材，让研究思路继续往前。',points:['网页图片浮框，按项目保存原图','已有本地文件夹，一次导入多个','项目归属与图片描述，继续保留'],step:1,variants:[{label:'采集后的项目图库',image:'01-project-library-1280x800.png',caption:'实际插件界面 · 独立演示资料'}]},
    prompt: {label:'反推与迭代提示词',title:['从画面里，','挑出你要的设计意图。'],description:'参考图反推成可编辑维度，最多三图组合。用外部工具生图，再回到插件对照效果，迭代提示词。',points:['体量、材料、构图与光线，分别编辑','整体确认后复制 Prompt，交给外部工具生图','对照效果评估偏差，确认修改并保存新版本'],step:3,variants:[{label:'提示词生成',image:'04-prompt-builder-1280x800.png',caption:'真实侧栏组合截图 · 建筑素材与 Prompt 为手工演示'},{label:'效果迭代',image:'05-prompt-optimization-1280x800.png',caption:'实际评估入口 · 未展示虚构的模型评估结果'}]},
    assets: {label:'沉淀图词资产',title:['让这次的成果，','接住下一次设计。'],description:'让参考图、已确认的提示词与效果图一起沉淀。通过项目、关键词或自然语言，找回下一次设计需要的线索。',points:['参考图库：按项目组织，描述与检索','提示词库：保留来源图、确认版本与效果图','本地资产与向量索引，支持持续复用'],step:5,variants:[{label:'提示词库',image:'03-prompt-library-1280x800.png',caption:'实际词库界面 · 演示版本用于展示信息组织'},{label:'参考图库',image:'02-image-description-1280x800.png',caption:'实际图片详情 · 描述可编辑，不模拟语义命中效果'}]}
  };
  const buttons = [...document.querySelectorAll('[data-chain]')];
  const byId = id => document.getElementById(id);
  let selected = 'capture';
  function selectVariant(index) {
    const variant = stages[selected].variants[index];
    if (!variant) return;
    const image = byId('chain-image');
    image.src = imageBase + variant.image;
    image.alt = 'ArchBuddy ' + variant.label + '实际界面';
    byId('chain-image-label').textContent = variant.label;
    byId('chain-caption').textContent = variant.caption;
    document.querySelectorAll('[data-variant]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.variant) === index)));
  }
  function selectStage(key) {
    const stage = stages[key];
    if (!stage) return;
    selected = key;
    buttons.forEach(button => button.setAttribute('aria-selected',String(button.dataset.chain === key)));
    byId('chain-label').textContent = stage.label;
    byId('chain-title').replaceChildren(document.createTextNode(stage.title[0]),document.createElement('br'),document.createTextNode(stage.title[1]));
    byId('chain-description').textContent = stage.description;
    byId('chain-points').replaceChildren(...stage.points.map(text => {const item=document.createElement('li');item.textContent=text;return item;}));
    byId('chain-case-link').href = 'case-study/workflow.html#step-' + stage.step;
    const switcher = byId('variant-switch');
    switcher.replaceChildren(...stage.variants.map((variant,index) => {const button=document.createElement('button');button.type='button';button.dataset.variant=String(index);button.textContent=variant.label;button.addEventListener('click',()=>selectVariant(index));return button;}));
    switcher.hidden = stage.variants.length === 1;
    selectVariant(0);
  }
  buttons.forEach(button => button.addEventListener('click',()=>selectStage(button.dataset.chain)));
  const dialog = byId('image-dialog');
  document.querySelectorAll('[data-enlarge]').forEach(button => button.addEventListener('click',()=>{
    const source=byId(button.dataset.enlarge);const large=byId('dialog-image');large.src=source.src;large.alt=source.alt;dialog.showModal();
  }));
  document.querySelector('[data-close-dialog]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();});
  document.querySelector('[data-copy-address]').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText('chrome://extensions/');byId('copy-feedback').textContent='已复制，请粘贴到 Chrome 地址栏。';}
    catch{byId('copy-feedback').textContent='请复制：chrome://extensions/';}
  });
})();
