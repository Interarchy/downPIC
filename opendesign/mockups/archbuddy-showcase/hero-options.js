(() => {
  'use strict';
  const hero=document.querySelector('.abhero'),box=document.getElementById('hero-toolbox');
  if(!hero||!box)return;
  const brand=document.getElementById('type-brand'),phrase=document.getElementById('type-phrase'),choices=[...document.querySelectorAll('[data-choice]')],slots=[...box.querySelectorAll('[data-tool-slot]')],cards=[...box.querySelectorAll('[data-tool]')];
  const mobile=document.getElementById('tool-mobile-detail'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  const features=[{"title":"快速采集","desc":"浏览案例时一键保存参考图，按项目自动归档。把灵感收进图词库，让浏览继续流畅向前。"},{"title":"构建提示词","desc":"提取参考图的体量、材质、光线与构图，组合结构化提示词。把视觉感受转为清晰的设计语言。"},{"title":"画布创作","desc":"连接参考图、提示词与生成步骤，逐轮优化效果图。保留各版本图片与提示词，随时回看。"},{"title":"搜索复用","desc":"描述画面特征，快速找回图片与提示词版本。复制已有提示词，让积累继续参与下一次创作。"}];
  const variants={
    a:{name:'A / 悬浮工具匣',sub:'采集、表达、创作、复用。在一条完整的设计链路里。',tray:'CREATIVE TOOLBOX',lines:['让灵感，成为设计的起点','让参考，成为清晰的语言','让每次创作，都有所积累']},
    b:{name:'B / 建筑档案匣',sub:'把所见、所想与每次推敲，收进自己的设计档案。',tray:'DESIGN ARCHIVE',lines:['收藏所见，构筑所想','让参考图，说出设计意图','让每一次推敲，都有迹可循']},
    c:{name:'C / 光轨工作台',sub:'四项核心能力，连接从参考到创作的每一步。',tray:'CONNECTED WORKSPACE',lines:['从一张参考，到新的可能','把设计意图，连接成画布','让创作循环，持续向前']}
  };
  let variant='a',timer=0,closeTimer=0,visible=true,stage='brand',index=0,line=0,active=-1;
  function schedule(delay){clearTimeout(timer);if(visible&&!document.hidden&&!motion.matches)timer=setTimeout(tick,delay);}
  function tick(){
    const words=variants[variant].lines;
    if(stage==='brand'){index++;brand.textContent='ArchBuddy'.slice(0,index);if(index>=9){stage='phrase';index=0;schedule(230);}else schedule(85);}
    else if(stage==='phrase'){index++;phrase.textContent=Array.from(words[line]).slice(0,index).join('');if(index>=Array.from(words[line]).length){stage='erase';schedule(2300);}else schedule(85);}
    else {index--;phrase.textContent=Array.from(words[line]).slice(0,Math.max(0,index)).join('');if(index<=0){line=(line+1)%words.length;stage='phrase';schedule(330);}else schedule(28);}
  }
  function begin(){
    clearTimeout(timer);stage='brand';index=0;line=0;
    if(motion.matches){brand.textContent='ArchBuddy';phrase.textContent=variants[variant].lines[0];return;}
    brand.textContent='';phrase.textContent='';schedule(120);
  }
  function selectTool(n){
    clearTimeout(closeTimer);active=n;box.classList.toggle('has-open',n>=0);
    slots.forEach((slot,i)=>slot.classList.toggle('is-open',i===n));
    cards.forEach((card,i)=>{card.setAttribute('aria-expanded',String(i===n));document.getElementById('tool-detail-'+i).setAttribute('aria-hidden',String(i!==n));});
    mobile.querySelector('strong').textContent=n>=0?features[n].title:'你的四件设计工具';
    mobile.querySelector('p').textContent=n>=0?features[n].desc:'轻点一张卡片，抽取它的完整能力。';
    document.getElementById('tool-hint').textContent=n>=0?'移向另一张卡片，继续探索':'悬停卡片，抽取一项创作能力';
  }
  function selectVariant(value,updateUrl){
    variant=Object.hasOwn(variants,value)?value:'a';
    document.body.dataset.heroVariant=variant;
    document.getElementById('hero-edition').textContent=variants[variant].name;
    document.getElementById('hero-subline').textContent=variants[variant].sub;
    document.getElementById('tray-text').textContent=variants[variant].tray;
    choices.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.choice===variant)));
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('v',variant);history.replaceState(null,'',url);}
    selectTool(-1);begin();
  }
  choices.forEach(button=>button.addEventListener('click',()=>selectVariant(button.dataset.choice,true)));
  slots.forEach((slot,i)=>slot.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')selectTool(i);}));
  cards.forEach((card,i)=>{card.addEventListener('focus',()=>selectTool(i));card.addEventListener('click',()=>selectTool(i));});
  box.addEventListener('pointerleave',()=>{if(!box.contains(document.activeElement))closeTimer=setTimeout(()=>selectTool(-1),180);});
  box.addEventListener('focusout',event=>{if(!box.contains(event.relatedTarget))selectTool(-1);});
  document.addEventListener('pointerdown',event=>{if(active>=0&&!box.contains(event.target))selectTool(-1);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')selectTool(-1);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else schedule(160);});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule(160);else clearTimeout(timer);},{threshold:.1}).observe(hero);
  motion.addEventListener('change',begin);
  selectVariant(new URLSearchParams(location.search).get('v')||'a',false);
})();
