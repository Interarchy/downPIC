(() => {
  'use strict';
  const F=window.ArchBuddyFilm, $=id=>document.getElementById(id);
  const film=$('film'),page=$('case-page'),viewport=$('browser-viewport');
  const shots=[...document.querySelectorAll('.case-shot')],saved=[...document.querySelectorAll('.saved-image')];
  const toolbar=$('floating-toolbar'),save=toolbar.querySelector('[data-action="save"]');
  const folder=$('new-folder'),content=$('folder-content'),ring=$('click-ring');
  const flight=document.createElement('div');flight.className='save-flight';film.append(flight);
  const starts=[.9,4.1,7.3,10.5],mix=(a,b,p)=>a+(b-a)*p;
  document.body.classList.add('time-driven');film.classList.add('is-playing');
  F.create({duration:16,render(t){
    const intro=F.ease(F.ramp(t,.1,.7));
    document.querySelectorAll('.browser-window,.files-window').forEach(el=>{el.style.opacity=intro;el.style.transform='translateY('+((1-intro)*18)+'px)';});
    const max=Math.max(0,page.scrollHeight-viewport.clientHeight);
    const targets=shots.map(shot=>Math.max(0,Math.min(max,shot.querySelector('.case-image').offsetTop-52)));
    let index=0,scroll=0;
    starts.forEach((start,i)=>{if(t>=start){index=i;scroll=mix(i?targets[i-1]:0,targets[i],F.ease(F.ramp(t,start,start+.82)));}});
    page.style.transform='translateY('+(-scroll)+'px)';
    $('browser-scroll-thumb').style.transform='translateY('+((document.querySelector('.browser-scroll-track').clientHeight-$('browser-scroll-thumb').clientHeight)*scroll/Math.max(1,max))+'px)';
    const local=t-starts[index],visible=local>=.9&&local<2.9,pressed=local>=1.45&&local<2.45;
    const count=starts.filter(start=>t>=start+2.45).length,hasFolder=t>=starts[0]+1.45;
    F.show(folder,hasFolder);F.show(content,hasFolder);folder.style.opacity=hasFolder?1:0;folder.style.transform='none';
    saved.forEach((el,i)=>{F.show(el,i<count);el.classList.toggle('just-arrived',t>=starts[i]+2.45&&t<starts[i]+2.97);});
    folder.classList.toggle('pulse',local>=2.45&&local<2.9);
    $('folder-subtitle').textContent=count?count+' 张图片':'新建项目文件夹';
    $('file-count').textContent=count+' 张新保存';
    $('file-status').textContent=t>=14.5?'采集完成 · 1 个项目文件夹':local>=1.6&&local<2.45?'图片自动收进项目文件夹':local>=2.45?'图片已加入水岸文化中心':hasFolder?'继续向下浏览':'浏览案例页面';
    toolbar.classList.toggle('visible',visible);toolbar.classList.toggle('pressed',pressed);toolbar.setAttribute('aria-hidden',String(!visible));
    save.textContent=local>=2.45?'已保存':pressed?'保存中…':'保存图片';$('toolbar-feedback').hidden=local<2.45;
    shots.forEach((shot,i)=>{shot.classList.toggle('active',visible&&i===index);shot.querySelector('.case-image').classList.toggle('extracting',i===index&&local>=1.6&&local<2.45);});
    const scale=film.getBoundingClientRect().width/1440||1,image=shots[index].querySelector('.case-image');
    const ir=image.getBoundingClientRect(),vr=viewport.getBoundingClientRect();
    toolbar.style.top=((ir.top-vr.top)/scale+10)+'px';toolbar.style.left=((ir.left-vr.left+ir.width/2)/scale)+'px';
    const br=save.getBoundingClientRect(),click=F.ramp(local,1.45,2);
    ring.style.left=((br.left-vr.left+br.width/2)/scale)+'px';ring.style.top=((br.top-vr.top+br.height/2)/scale)+'px';
    ring.style.opacity=local>=1.45&&local<2?String(.75*(1-click)):'0';ring.style.transform='translate(-50%,-50%) scale('+(.25+click*1.15)+')';
    flight.style.display=local>=1.6&&local<2.45?'block':'none';
    if(local>=1.6&&local<2.45){
      const dr=saved[index].getBoundingClientRect(),fr=film.getBoundingClientRect(),p=F.ease(F.ramp(local,1.6,2.45));
      const dx=(dr.left-ir.left)/scale,dy=(dr.top-ir.top)/scale;
      flight.style.left=((ir.left-fr.left)/scale)+'px';flight.style.top=((ir.top-fr.top)/scale)+'px';
      flight.style.width=(ir.width/scale)+'px';flight.style.height=(ir.height/scale)+'px';
      flight.style.setProperty('--x',image.style.getPropertyValue('--x'));flight.style.setProperty('--y',image.style.getPropertyValue('--y'));
      flight.style.transform='translate('+dx*p+'px,'+(dy*p-48*Math.sin(Math.PI*p))+'px) scale('+mix(1,dr.width/ir.width,p)+','+mix(1,dr.height/ir.height,p)+')';
      flight.style.opacity='.98';
    }
    $('progress-bar').style.width=(t/16*100)+'%';
  }});
})();