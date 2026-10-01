import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'extension/store/assets/v4');
await mkdir(output, { recursive: true });
const dataImage = async file => 'data:image/png;base64,' + (await readFile(file)).toString('base64');
const logo = await dataImage(path.join(root, 'extension/icons/icon-128.png'));
const library = await dataImage(path.join(output, '01-project-library-1280x800.png'));
// 品牌宣传采用现有 Logo 和真实 V4 截图；不调用模型，不读取个人图库。
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>ArchBuddy 商店宣传图</title><style>
*{box-sizing:border-box}html,body{margin:0}body{font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#fff;background:#25634b}.canvas{position:relative;overflow:hidden;width:1400px;height:560px;background:#25634b}.brand{display:flex;align-items:center;gap:14px;font-family:"Segoe UI",sans-serif;font-weight:650;font-size:32px}.brand img{width:64px;height:64px}.copy{position:absolute;left:46px;top:38px;width:420px}h1{font-size:51px;line-height:1.32;letter-spacing:1px;font-weight:650;margin:45px 0 23px}p{margin:0;color:#dbe9e1;font-size:19px;line-height:1.9}.audience{position:absolute;bottom:40px;left:52px;color:#e4efe8;font-size:16px}.product{position:absolute;right:40px;top:29px;width:804px;height:503px;background:#f3f7f4;border:1px solid #a8c4b4;box-shadow:0 20px 40px #163e3033;overflow:hidden;border-radius:12px}.product img{display:block;width:804px;height:502.5px;object-fit:contain}.small{width:440px;height:280px}.small .copy{left:26px;top:22px;width:388px}.small .brand{font-size:29px;gap:12px}.small .brand img{width:48px;height:48px}.small h1{font-size:33px;line-height:1.36;margin:22px 0 0;letter-spacing:.8px}.small .audience{left:30px;bottom:25px;font-size:14px}.small .product,.small p{display:none}
</style></head><body><main class="canvas"><section class="copy"><div class="brand"><img src="${logo}" alt="ArchBuddy Logo"><span>ArchBuddy</span></div><h1>建筑灵感<br>随时找回</h1><p>采集与整理参考图<br>生成、组合并优化提示词</p></section><div class="product"><img src="${library}" alt="当前 V4 项目图库演示"></div><div class="audience">建筑设计师的图词库</div></main></body></html>`;
const browser = await chromium.launch({headless:true, executablePath:process.env.ARCHBUDDY_SCREENSHOT_BROWSER});
const results=[];
try {
 const page = await browser.newPage({viewport:{width:1400,height:560},deviceScaleFactor:1});
 await page.route('**/*', route => route.request().url().startsWith('data:') ? route.continue() : route.abort());
 await page.setContent(html);
 await page.evaluate(async () => {await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
 for (const variant of [{file:'marquee-promo-1400x560.png',width:1400,height:560,small:false},{file:'small-promo-440x280.png',width:440,height:280,small:true}]) {
  await page.evaluate(small=>document.querySelector('.canvas').classList.toggle('small',small),variant.small);
  await page.setViewportSize({width:variant.width,height:variant.height});
  const buffer=await page.screenshot({type:'png',clip:{x:0,y:0,width:variant.width,height:variant.height}});
  const file=path.join(output,variant.file);
  await sharp(buffer).removeAlpha().toColourspace('srgb').png().toFile(file);
  const meta=await sharp(file).metadata();
  if(meta.width!==variant.width||meta.height!==variant.height||meta.channels!==3||meta.hasAlpha)throw new Error('图片格式不符合要求：'+variant.file);
  results.push({file:variant.file,width:meta.width,height:meta.height,channels:meta.channels,hasAlpha:meta.hasAlpha});
 }
 await writeFile(path.join(output,'promotion-format-check.json'),JSON.stringify({generatedAt:new Date().toISOString(),modelCalls:0,images:results},null,2)+'\n');
 process.stdout.write(JSON.stringify(results,null,2)+'\n');
} finally {await browser.close();}
