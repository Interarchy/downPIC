const variant=Number(document.body.dataset.variant);
const $=s=>document.querySelector(s);
let enabled=true;
let toastTimer;
function toast(text){const el=$('#demo-toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3200);}
function surface(name){document.querySelectorAll('.surface').forEach(el=>el.classList.toggle('active',el.id===name));document.querySelectorAll('[data-surface]').forEach(el=>el.classList.toggle('active',el.dataset.surface===name));}
function pane(name){document.querySelectorAll('[data-side-pane]').forEach(el=>el.hidden=el.dataset.sidePane!==name);document.querySelectorAll('[data-pane]').forEach(el=>el.classList.toggle('active',el.dataset.pane===name));}
function setEnabled(value){enabled=value;$('#float-toolbar').hidden=!value;$('#folded-logo').hidden=true;$('#power-rail').hidden=value||variant!==3;$('#undo-notice').hidden=value||variant!==1;$('#popup-status').textContent=value?'已开启':'已关闭';$('.popup-toggle .switch').classList.toggle('is-on',value);}
function reset(){setEnabled(true);$('.saved').hidden=true;const save=$('[data-action="save"]');save.textContent='保存图片';save.disabled=false;}
document.addEventListener('click',event=>{
 const surfaceButton=event.target.closest('[data-surface]');if(surfaceButton){surface(surfaceButton.dataset.surface);return;}
 const paneButton=event.target.closest('[data-pane]');if(paneButton){pane(paneButton.dataset.pane);return;}
 const control=event.target.closest('[data-action]');if(!control)return;
 switch(control.dataset.action){
 case 'close':case 'power':setEnabled(false);break;
 case 'enable':reset();break;
 case 'toggle':setEnabled(!enabled);break;
 case 'fold':$('#float-toolbar').hidden=true;$('#folded-logo').hidden=false;break;
 case 'unfold':$('#float-toolbar').hidden=false;$('#folded-logo').hidden=true;break;
 case 'reset':reset();break;
 case 'save':control.textContent='已保存';control.disabled=true;$('.saved').hidden=false;toast('交互演示：图片已保存，随后生成概要描述');break;
 case 'analyze':surface('sidebar');pane('generation');break;
 case 'library':surface('library');toast('实际插件中会在新标签页直接打开图词库');break;
 case 'popup':surface('popup');break;
 case 'sidebar':surface('sidebar');pane('generation');break;
 case 'categories':surface('sidebar');pane('categories');break;
 case 'copy':toast('示例：来源网页链接已复制');break;
 case 'source':toast('实际插件中会在新标签页打开这张图片的来源网页');break;
 case 'select-type':document.querySelectorAll('.type-row').forEach(el=>{const selected=el===control;el.classList.toggle('selected',selected);el.querySelector('small').textContent=selected?'默认':'设为默认';});break;
 case 'add-category':{const input=$('#new-category'),name=input.value.trim();if(!name){toast('请先输入项目类型名称');break;}const row=document.createElement('button');row.className='type-row';row.dataset.action='select-type';const handle=document.createElement('span');handle.textContent='⠿';const label=document.createElement('b');label.textContent=name;const hint=document.createElement('small');hint.textContent='设为默认';row.append(handle,label,hint);$('.type-list').append(row);input.value='';toast('已添加示例分类');break;}
 default:toast('静态方案演示：此操作会沿用插件现有功能');
 }
});
