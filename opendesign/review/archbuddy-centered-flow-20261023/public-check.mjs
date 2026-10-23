import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(fs.readFileSync('cloudbase/dist/showcase-centered-flow-20261023/deployment-manifest.json','utf8'));
const base='https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/';
const results=await Promise.all(manifest.files.map(async file=>{
 try{
  const response=await fetch(base+file.path+'?v=centered-flow-20261023',{signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  const sha256=createHash('sha256').update(bytes).digest('hex').toUpperCase();
  return{path:file.path,status:response.status,bytes:bytes.length,match:response.ok&&sha256===file.sha256};
 }catch(e){return{path:file.path,error:String(e),match:false};}
}));
const privacy=await fetch('https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/',{signal:AbortSignal.timeout(30000)});
const privacyBytes=Buffer.from(await privacy.arrayBuffer());
const privacySha256=createHash('sha256').update(privacyBytes).digest('hex').toUpperCase();
const report={version:manifest.contentVersion,matching:results.filter(r=>r.match).length,total:results.length,mismatches:results.filter(r=>!r.match),privacy:{status:privacy.status,bytes:privacyBytes.length,sha256:privacySha256}};
fs.writeFileSync('opendesign/review/archbuddy-centered-flow-20261023/public-hashes.json',JSON.stringify({...report,results},null,2));
console.log(JSON.stringify(report));
if(report.matching!==report.total||privacySha256!=='D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8')process.exitCode=1;
