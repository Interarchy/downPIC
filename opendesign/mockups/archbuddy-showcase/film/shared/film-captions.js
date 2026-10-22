(() => {
  'use strict';
  const chapters={"1":[[0.1,"浏览案例，一键保存参考图"],[2.5,"图片自动归档，连续采集更快"],[6.2,"四张参考，集中收进项目文件夹"]],"2":[[0.1,"从参考图提炼主体与体量"],[2.9,"补充视角、景观与空间关系"],[5.1,"加入材料与光线，表达设计意图"],[7.4,"组合成完整、可编辑的提示词"]],"3":[[0.1,"输入提示词，放入参考图片"],[2.7,"连接文字与图像，生成效果图"],[5.6,"第一轮优化，保留提示词与结果"],[8.4,"继续第二轮，历史版本仍然保留"],[11.2,"对照各版图片，回看修改过程"]],"4":[[0.1,"积累图片、提示词与版本记录"],[1.8,"描述图片特征，进行语义搜索"],[6.1,"快速找到符合设计意图的参考"],[7.5,"查看提示词版本与关联图片"],[11.3,"复制所需提示词，再次用于创作"]]};
  window.renderFilmCaption=(t)=>{
    const film=document.querySelector('.film');
    const list=chapters[film.dataset.chapter];
    const el=document.getElementById('action-caption');
    if(!el||!list)return;
    const cue=[...list].reverse().find(([start])=>t>=start);
    if(!cue){el.textContent='';el.classList.remove('is-typing');return;}
    const [start,text]=cue;
    const chars=Array.from(text),duration=Math.min(1.05,chars.length*.035);
    const p=Math.min(1,Math.max(0,(t-start)/duration));
    const value=chars.slice(0,Math.floor(p*chars.length)).join('');
    if(el.textContent!==value)el.textContent=value;
    el.classList.toggle('is-typing',p<1);
  };
})();