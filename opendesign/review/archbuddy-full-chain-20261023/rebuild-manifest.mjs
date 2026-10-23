import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('opendesign');
const groups=[];
for(const entry of fs.readdirSync(path.join(root,'mockups'),{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
 const base=path.join(root,'mockups',entry.name);
 const files=fs.readdirSync(base,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.html')).map(e=>{
  const absolute=path.join(e.parentPath??e.path,e.name);
  const relative=path.relative(root,absolute).replaceAll('\\','/');
  return{label:path.relative(base,absolute).replaceAll('\\','/'),path:relative};
 }).sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length)groups.push({slug:entry.name,files});
}
const systems=[];
for(const entry of fs.readdirSync(path.join(root,'design-systems'),{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
 const base=path.join(root,'design-systems',entry.name);
 const files=fs.readdirSync(base,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{
  const absolute=path.join(e.parentPath??e.path,e.name);
  return{label:path.relative(base,absolute).replaceAll('\\','/'),path:path.relative(root,absolute).replaceAll('\\','/')};
 }).sort((a,b)=>a.path.localeCompare(b.path));
 if(files.length)systems.push({slug:entry.name,files});
}
const manifest={generated:new Date().toISOString(),sections:[{id:'mockups',label:'Mockups',groups},{id:'design-systems',label:'Design Systems',groups:systems}]};
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({mockupGroups:groups.length,htmlFiles:groups.reduce((n,g)=>n+g.files.length,0),designSystems:systems.length}));
