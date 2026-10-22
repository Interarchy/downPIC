(() => {
  'use strict';
  const F = window.ArchBuddyFilm;
  const $ = id => document.getElementById(id);
  const query = '沿水面舒展展开的建筑';
  const candidates = [
    { title:'水岸文化中心 · 主入口', kind:'water', x:'0%', y:'0%', tag:'参考图 · 水平体量', text:'沿水岸展开的低矮公共建筑，连接城市步道与亲水平台。', match:true },
    { title:'玻璃中庭', kind:'sheet', x:'31.132%', y:'33.982%', tag:'文化建筑 · 玻璃', text:'通透明亮的中庭，连续结构与室内绿植。' },
    { title:'林间礼堂', kind:'sheet', x:'61.604%', y:'33.982%', tag:'文化建筑 · 石材', text:'树荫下的石砌礼堂，朴素而安静的入口。' },
    { title:'水岸文化中心 · 鸟瞰', kind:'water', x:'100%', y:'0%', tag:'参考图 · 河岸与绿地', text:'河道、绿地与建筑共同形成舒展连续的空间关系。', match:true },
    { title:'木构文化中心', kind:'sheet', x:'92.075%', y:'33.982%', tag:'文化建筑 · 庭院', text:'连续木廊围合开放庭院，温暖光线落入日常空间。' },
    { title:'山谷美术馆', kind:'sheet', x:'31.132%', y:'80.24%', tag:'山地 · 清水混凝土', text:'安静的几何体量与山谷呼应，前景保留自然草地。' },
    { title:'水岸文化中心 · 廊道', kind:'water', x:'0%', y:'100%', tag:'参考图 · 木构与光线', text:'温润木构廊道沿水面延伸，连接开放庭院。', match:true },
    { title:'天光美术馆', kind:'sheet', x:'61.604%', y:'80.24%', tag:'展览 · 天光', text:'柔和天光照亮白色展厅，材质与光线克制清晰。' },
    { title:'砖砌图书馆', kind:'sheet', x:'92.075%', y:'80.24%', tag:'砖墙 · 阅览空间', text:'层叠书架与暖光形成安静而有秩序的阅读空间。' },
    { title:'水岸文化中心 · 亲水平台', kind:'water', x:'100%', y:'100%', tag:'参考图 · 滨水公共空间', text:'沿水面的公共平台与舒展屋檐回应开放景观。', match:true },
    { title:'开放庭院 · 材料研究', kind:'sheet', x:'92.075%', y:'33.982%', tag:'材料 · 木构', text:'木廊、玻璃与树影建立空间的温暖层次。' },
    { title:'山地公共建筑', kind:'sheet', x:'31.132%', y:'80.24%', tag:'方案参考 · 山地', text:'建筑几何与自然地形形成清晰的体量关系。' },
    { title:'中庭与城市客厅', kind:'sheet', x:'31.132%', y:'33.982%', tag:'公共空间 · 采光', text:'通透结构引入自然光和室内绿化。' },
    { title:'林间入口', kind:'sheet', x:'61.604%', y:'33.982%', tag:'入口 · 石材', text:'保留自然树木与安静的步行尺度。' },
    { title:'展厅与光', kind:'sheet', x:'61.604%', y:'80.24%', tag:'空间 · 展陈', text:'自然光从顶部进入，形成温和的明暗变化。' },
    { title:'安静的阅读空间', kind:'sheet', x:'92.075%', y:'80.24%', tag:'室内 · 阅览', text:'细腻砖墙与书架保留清晰的空间秩序。' },
    { title:'文化建筑 · 木廊', kind:'sheet', x:'92.075%', y:'33.982%', tag:'建筑细部 · 木', text:'连续廊道连接展厅和公共庭院。' },
    { title:'文化建筑 · 入口广场', kind:'sheet', x:'31.132%', y:'80.24%', tag:'公共建筑 · 广场', text:'克制的几何体量面向自然景观展开。' },
    { title:'自然光展厅', kind:'sheet', x:'61.604%', y:'80.24%', tag:'光线 · 材料', text:'均匀的漫射光呈现真实细腻的表面。' },
    { title:'林下石砌空间', kind:'sheet', x:'61.604%', y:'33.982%', tag:'文化建筑 · 森林', text:'粗粝石材与柔和林下光线的关系。' }
  ];
  function card(item, result, index) {
    const element = document.createElement('article');
    element.className = 'asset-card' + (result && index === 0 ? ' selected' : '');
    const select = document.createElement('div'); select.className = 'asset-select';
    select.innerHTML = '<i></i><span>选择</span><span>拖至左侧分组</span>';
    const photo = document.createElement('div'); photo.className = 'asset-photo ' + item.kind;
    photo.style.setProperty('--px', item.x); photo.style.setProperty('--py', item.y);
    const copy = document.createElement('div'); copy.className = 'asset-copy';
    const title = document.createElement('h3'); title.textContent = item.title;
    const tag = document.createElement('p'); tag.textContent = item.tag;
    copy.append(title, tag);
    if (result) { const excerpt = document.createElement('p'); excerpt.className = 'asset-excerpt'; excerpt.textContent = item.text; copy.append(excerpt); }
    element.append(select, photo, copy); return element;
  }
  candidates.forEach((item, i) => $('asset-grid').append(card(item, false, i)));
  candidates.filter(item => item.match).forEach((item, i) => $('results-grid').append(card(item, true, i)));
  function render(t) {
    const focus = F.ease(F.ramp(t, 2.4, 3.8)) * (1 - F.ease(F.ramp(t, 7.4, 8.2)));
    $('app-camera').style.transform = 'translate(0px,0px) scale(1)';
    const lens=F.ease(F.ramp(t,3.3,3.8))*(1-F.ease(F.ramp(t,7.4,8.2)));
    $('search-magnifier').style.opacity=String(lens);
    $('search-magnifier').style.transform='translateY('+((1-lens)*18)+'px) scale('+(.96+.04*lens)+')';
    $('search-focus-shade').style.opacity=String(lens*.5);
    F.type($('magnifier-query'),query,t,4.0,6.5);
    $('magnifier-caret').style.opacity=t<7.1?'1':'0';
    $('magnifier-search').classList.toggle('pressed',t>=7&&t<7.45);
    const queryProgress = F.ramp(t, 4.0, 6.5);
    F.type($('query-text'), query, t, 4.0, 6.5);
    $('query-placeholder').style.display = queryProgress > 0 ? 'none' : '';
    $('query-caret').style.opacity = t >= 3.7 && t < 7.15 ? String(.35 + .65 * Math.abs(Math.sin(t * 5))) : '0';
    $('search-field').style.boxShadow = '0 0 0 ' + (4 * focus) + 'px rgba(154,193,164,' + (.30 * focus) + ')';
    $('search-button').classList.toggle('pressed', t >= 7 && t < 7.45);
    const results = F.ease(F.ramp(t, 8.2, 9.1));
    $('asset-grid').style.opacity = String(1 - results);
    $('asset-grid').style.transform = 'translateY(' + (-12 * F.ease(F.ramp(t, .5, 2.2)) - 16 * results) + 'px)';
    $('asset-grid').style.visibility = results === 1 ? 'hidden' : 'visible';
    $('results-grid').style.opacity = String(results);
    $('results-grid').style.transform = 'translateY(' + (16 * (1 - results)) + 'px)';
    $('search-status').style.opacity = String(F.ease(F.ramp(t, 7.1, 7.5)));
    $('status-text').textContent = t < 8.2 ? '正在语义搜索…' : '找到 4 项相关图词';
    $('result-count').textContent = t < 8.2 ? '显示 20 / 20 项' : '全提示词库搜索 · 4 / 20 项';
    const detail = F.ease(F.ramp(t, 10.4, 11.5));
    $('asset-detail').style.opacity = String(detail);
    $('asset-detail').style.transform = 'translateX(' + (128 * (1 - detail)) + 'px)';
    const highlight=F.ease(F.ramp(t,12,13.1));
    $('asset-detail').style.setProperty('--prompt-emphasis',String(highlight));
  }
  F.create({duration:22.5,render});
})();
