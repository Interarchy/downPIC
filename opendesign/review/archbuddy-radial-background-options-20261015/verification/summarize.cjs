const fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'metrics.json')));
function rgb(s){return s.startsWith('#')?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):s.match(/[\d.]+/g).slice(0,3).map(Number)}
function l(s){const c=rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function contrast(a,b){const x=l(a),y=l(b);return +( (Math.max(x,y)+.05)/(Math.min(x,y)+.05) ).toFixed(2)}
const summaries=data.results.map(r=>{
 const center=r.svgWidth/2, outer=r.svgWidth*.445, flow=r.svgWidth*(.26+(.445-.26)/3),scale=r.svgWidth/560;
 const boxes=r.texts.filter(t=>t.class==='step-label').flatMap(t=>t.characters);
 const radii=boxes.flatMap(b=>[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>Math.hypot(x-center,y-center)));
 const textBounds=r.texts.filter(t=>t.class!=='break-label').every(t=>t.bbox.x>=0&&t.bbox.y>=0&&t.bbox.x+t.bbox.width<=r.svgWidth&&t.bbox.y+t.bbox.height<=r.svgWidth);
 return {width:r.width,variant:r.variant,svg:r.svgWidth,fullWidth:r.section.x===0&&r.section.width===r.width,background:r.sectionBackground,numberColor:r.stages.map(s=>s.numberColor),stageContrast:r.sectorColors.map(c=>contrast('#153b2d',c)),deepBodyContrast:r.variant==='three'?contrast(r.elements.find(e=>e.text.startsWith('逐张保存')).color,r.sectionBackground):null,smallestGlyphOuterMargin:+(outer-Math.max(...radii)).toFixed(2),smallestGlyphFlowGap:+(Math.min(...radii)-flow).toFixed(2),textBounds,breakOuterExtension:+(12*scale).toFixed(2),haloSideVisible:+((Math.max(5,8*scale)-Math.max(.75,1.25*scale))/2).toFixed(2),c:r.texts.find(t=>t.class==='break-label'&&t.text.includes('C'))};
});
fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({c,numberColor,...r})=>({...r,numberColor:[...new Set(numberColor)],cText:c.text,cTransform:c.transform})),null,2));