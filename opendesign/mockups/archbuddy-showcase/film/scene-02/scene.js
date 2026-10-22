(() => {
  'use strict';
  const F=window.ArchBuddyFilm,$=id=>document.getElementById(id),film=$('film');
  const cards=[...document.querySelectorAll('.reference-card')],rows=[...document.querySelectorAll('.panel-row')];
  const copy = [
    ['沿水岸连续展开的公共文化建筑，连接城市步道与亲水平台。', '低矮而舒展的水平体量，以层叠屋面回应河岸的自然走势。'],
    ['高位鸟瞰同时呈现河道、绿地与建筑的整体空间关系。', '滨水步道穿行于草地与树影之间，形成开放连续的公共界面。'],
    ['温润木构搭配浅色石材和通透玻璃，呈现清晰细腻的质感。', '柔和自然光落在廊道与庭院，营造克制而温暖的氛围。']
  ];
  const assembled = [
    '一座沿水岸连续展开的公共文化建筑，串联城市步道、开放展厅与亲水平台；以开放界面回应滨水公共生活。',
    '以低矮舒展的水平体量组织展厅与廊道，层叠屋面顺应河岸走势，保留通向水面的视线与步行体验。',
    '采用高位鸟瞰视角，同时呈现河道、绿地、建筑与城市背景；让主体建筑清晰位于整体空间关系的中心。',
    '让滨水步道穿行于草地与树影之间，配置缓坡、停留平台和疏朗树群，形成连续开放的公共界面。',
    '使用温润木构、浅色石材与通透玻璃；突出屋檐、廊柱和细部节点的层次，呈现克制而精确的质感。',
    '以柔和自然光照亮廊道和庭院，控制水面反射与材质高光，营造安静、温暖且具有真实感的建筑氛围。'
  ];

  const begins=[.9,4.1,7.3],selected=[3.4,6.6,9.8],mix=(a,b,p)=>a+(b-a)*p;
  document.body.classList.add('time-driven');film.classList.add('is-playing');
  F.create({duration:18.5,render(t){
    const intro=F.ease(F.ramp(t,.1,.7)),workspace=document.querySelector('.workspace');
    workspace.style.opacity=intro;workspace.style.transform='translateY('+((1-intro)*18)+'px)';
    cards.forEach((card,i)=>{
      const p=F.ease(F.ramp(t,begins[i],begins[i]+.95));
      F.show(card,t>=begins[i]);card.style.left=mix(1350,i*266,p)+'px';card.style.opacity=p;
      card.style.transform='perspective(1100px) rotateY('+mix(14,6,p)+'deg) rotateZ(1.2deg) scale('+mix(.95,1,p)+')';
      const at=begins[i]+.9;
      card.classList.toggle('is-typing',t>=at);
      card.querySelector('.card-eyebrow').classList.toggle('revealed',t>=at+.1);
      let start=at+.17;
      card.querySelectorAll('.prompt-item').forEach((item,j)=>{
        item.classList.toggle('revealed',t>=start);
        const bodyStart=start+.11,end=bodyStart+Array.from(copy[i][j]).length*.014;
        F.type(item.querySelector('.typed'),copy[i][j],t,bodyStart,end);start=end+.08;
      });
      card.classList.toggle('has-copy',t>=start);card.classList.toggle('selected',t>=selected[i]);
      card.querySelector('.action-label').textContent=t>=selected[i]?'已加入整体 Prompt':'加入整体 Prompt';
    });
    [[$('join-one'),3.4],[$('join-two'),6.6],[$('combine-arrow'),9.8]].forEach(([el,start])=>{
      F.show(el,t>=start);const p=F.ease(F.ramp(t,start,start+.45));el.style.opacity=p;el.style.transform='scale('+mix(.7,1,p)+')';
    });
    const pp=F.ease(F.ramp(t,10.5,11.38)),panel=$('prompt-panel');F.show(panel,t>=10.5);
    panel.style.left=mix(1350,850,pp)+'px';panel.style.opacity=pp;
    let start=11.43,visibleRows=0;
    rows.forEach((row,i)=>{
      F.show(row,t>=start);if(t>=start)visibleRows++;
      const p=F.ease(F.ramp(t,start,start+.25));row.style.opacity=p;row.style.transform='translateY('+((1-p)*7)+'px)';
      const bodyStart=start+.12,end=bodyStart+Array.from(assembled[i]).length*.011;
      F.type(row.querySelector('.panel-typed'),assembled[i],t,bodyStart,end);start=end+.08;
    });
    $('confirm-button').classList.toggle('ready',t>=start+.05);
    const count=selected.filter(at=>t>=at).length;$('selected-count').textContent='已选 '+count+' / 3 张参考图';
    $('module-count').textContent=visibleRows+' 个设计维度';$('progress-bar').style.width=t/18.5*100+'%';
  }});
})();