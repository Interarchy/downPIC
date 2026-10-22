(() => {
  'use strict';
  const chapters={"1":[[0.2,"浏览建筑案例，发现值得保存的参考。"],[1.8,"浮框一键保存，图片自动收进项目文件夹。"],[4.8,"继续向下浏览，参考图依次收纳。"],[8.2,"按分类与网页标题归档，同一案例集中保存。"],[13.2,"四张参考收集完成，开始提炼设计语言。"]],"2":[[0.4,"从第一张参考图，提炼建筑主体与体量。"],[4.3,"加入第二张参考，补充视角与景观关系。"],[7.5,"再加入材料与光线，让设计意图更完整。"],[10.7,"组合六个设计维度，构建完整提示词。"],[15.8,"把参考中的设计语言，带入下一步创作。"]],"3":[[0.3,"输入提示词，放入参考图片。"],[3.2,"连接文字与图像，生成建筑效果图。"],[8.1,"选取生成结果，进入方案迭代。"],[11.3,"第一轮：调整光照与材质，保留修改记录。"],[15.3,"第二轮：继续优化细节，上一轮仍完整保留。"],[19.2,"对照各版图片，回看每一轮提示词。"]],"4":[[0.3,"图片、提示词与版本信息，集中保存在图词库。"],[3.1,"用文字描述图片特征，进行语义搜索。"],[8.3,"快速找到符合设计意图的参考。"],[11.1,"查看保存的提示词版本与关联图片信息。"],[18.7,"复制所需版本，让积累再次用于创作。"]]};
  window.renderFilmCaption=(t)=>{
    const film=document.querySelector('.film');
    const list=chapters[film.dataset.chapter];
    const el=document.getElementById('action-caption');
    if(!el||!list)return;
    const cue=[...list].reverse().find(([start])=>t>=start);
    if(!cue){el.textContent='';el.classList.remove('is-typing');return;}
    const [start,text]=cue;
    const chars=Array.from(text),duration=Math.min(1.45,chars.length*.045);
    const p=Math.min(1,Math.max(0,(t-start)/duration));
    const value=chars.slice(0,Math.floor(p*chars.length)).join('');
    if(el.textContent!==value)el.textContent=value;
    el.classList.toggle('is-typing',p<1);
  };
})();