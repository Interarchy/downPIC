import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// 当前真实扩展 + 独立临时 Chrome profile；仅演示数据，不读取个人图库、不调用模型。
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'extension/store/assets/v4');
const profile = path.join(root, 'extension/dist', 'store-screenshot-' + randomUUID());
await mkdir(output, { recursive: true });
const intermediate = path.join(root, 'extension/dist/v4-store-20260930/screenshot-parts');
await mkdir(intermediate, { recursive: true });
const shotPath = name => path.join(name.startsWith('_') ? intermediate : output, name);
const board = 'data:image/png;base64,' + (await readFile(path.join(root, 'prototype/assets/architecture-board.png'))).toString('base64');
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.ARCHBUDDY_SCREENSHOT_BROWSER,
  headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: ['--disable-extensions-except=' + path.join(root, 'extension'), '--load-extension=' + path.join(root, 'extension')],
});
const errors = [];
let modelRequests = 0;
await context.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
  if (url.startsWith('https://archbuddy-api-313819-12-1419174875.sh.run.tcloudbase.com/')
      && route.request().method() === 'GET' && /\/(api\/status|healthz)$/.test(url)) return route.continue();
  if (/\/api\/(library|analyze|evaluate)/.test(url)) modelRequests++;
  return route.abort();
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const origin = 'chrome-extension://' + new URL(worker.url()).hostname;
  // 截图 profile 中阻止模型端点；保留真实后台状态 GET，不伪造模型输出或向量。
  await worker.evaluate(() => {
    const originalFetch = self.fetch.bind(self); self.screenshotBlockedModelCalls = 0;
    self.fetch = (input, options) => {
      const url = String(typeof input === 'string' ? input : input.url);
      if (/\/api\/(library|analyze|evaluate)/.test(url)) {
        self.screenshotBlockedModelCalls++; throw new Error('截图模式不调用模型');
      }
      return originalFetch(input, options);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/privacy.html');
  await page.evaluate(async ({ board }) => {
    const shared = await import('./shared.mjs');
    const { putSourceImage } = await import('./source-image-store.mjs');
    const { STORAGE, PRINCIPLE, INTENT_MODULES, normalizeIntentModules, normalizePromptScheme } = shared;
    const bitmap = await createImageBitmap(await (await fetch(board)).blob());
    const blobs = [];
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      canvas.getContext('2d').drawImage(bitmap, i % 3 * 512, Math.floor(i / 3) * 512, 512, 512, 0, 0, 512, 512);
      blobs.push(await new Promise(resolve => canvas.toBlob(resolve, 'image/png')));
    }
    bitmap.close();
    const names = ['山谷美术馆', '木构文化中心', '天光艺术馆', '砖砌图书馆', '玻璃中庭', '林间礼堂'];
    const descriptions = [
      '山地环境中的浅灰混凝土公共建筑，几何体量与山谷呼应。柔和阴天光照，底层玻璃开口透出暖光，前景保留自然草地。',
      '暖色木构围合开放庭院，连续步廊与弧形步道连接各个空间。细高乔木与木质休憩平台交织，日光下氛围温暖舒展。',
      '矩形天窗引入柔和自然顶光，灰白墙面、浅色地面和少量石质展品组成静谧展厅，充分留白，空间比例清晰。',
      '砖砌图书馆的高挑阅览空间，温暖木质桌椅和连续书架形成秩序。侧面日光穿过大窗，营造安静阅读氛围。',
      '通透的玻璃中庭以钢构网格形成秩序，顶部天光照亮室内树木和休憩家具，平视构图强调空间深度。',
      '林间石砌礼堂坐落在自然树林中，粗糙石材和木质拱门强调质感。柔和日光穿过树冠，环境宁静。',
    ];
    const types = ['文化建筑', '文化建筑', '文化建筑', '文化建筑', '文化建筑', '文化建筑', '教育建筑', '教育建筑', '社区建筑', '社区建筑'];
    const projects = [...names, '校园图书馆', '校园共享中庭', '社区庭院', '社区礼堂'];
    const imported = [];
    for (let i = 0; i < projects.length; i++) {
      const crop = i < 6 ? i : [3, 4, 1, 5][i - 6];
      const id = crypto.randomUUID(); const blob = blobs[crop];
      await putSourceImage({ sourceReferenceId: id, schemeId: id, blob });
      imported.push({ id, type: types[i], project: projects[i], name: names[crop] + '参考图.png',
        sourcePath: types[i] + '/' + projects[i] + '/参考图.png', fingerprint: 'store-demo-' + i,
        size: blob.size, date: new Date(Date.UTC(2026, 8, 30, 10, 0, 0) - i * 60000).toISOString(),
        description: descriptions[crop], descriptionStatus: 'ready' });
    }
    function modulesFor(i) {
      const values = {
        reference_summary: descriptions[i], scene_subject: names[i] + '的建筑与空间表达。',
        space_massing: i === 0 ? '以简洁的折面主体与水平低矮体量建立层次，保留公共建筑尺度。' : '保持空间尺度与体量关系，强调清晰的空间层次。',
        facade_elements: i === 1 ? '连续木构立面和深色挑檐，开口与步廊形成有序节奏。' : '简洁立面与克制的开口比例，构件表达清晰。',
        materials_surfaces: i === 1 ? '温暖木质表面具有细密竖向纹理，玻璃与细框构件保持轻盈。' : i === 0 ? '浅灰混凝土保留模板分缝与细微色差，玻璃窗带反射周边山景。' : '细腻哑光墙面与浅色地板，石质展品形成材质对照。',
        landscape_context: i === 0 ? '前景草地与疏落树木，中景建筑，远景深绿山林与岩壁，层次连续。' : '自然植被与步道组织有序，配景克制，突出空间。',
        view_composition: '保留参考图的视角与构图，主体位置和画幅比例不变。',
        color_tone: i === 1 ? '蜂蜜色木材与绿色植被为主，蓝灰天空辅助，整体温暖低饱和。' : '冷灰建筑与深绿山林为主，少量暖色开口形成冷暖对照。',
        lighting_atmosphere: i === 2 ? '柔和自然顶光，明暗过渡平缓，空间静谧通透。' : '柔和自然光，保留明暗层次与温暖室内光，避免高反差。',
        image_expression: '写实建筑效果图，材质细腻可信，曝光自然，避免失真与过度锐化。',
        negative_constraints: '避免改变主体体量、视角和空间布局，避免夸张光晕与不合理构件。',
      };
      return normalizeIntentModules(INTENT_MODULES.map(d => ({ key: d.key, value: values[d.key], enabled: true, basis: 'observed', confidence: 'high', reviewState: 'confirmed' })));
    }
    const groups = [{ id: 'mountain', name: '山地与公共建筑' }, { id: 'courtyard', name: '木构与庭院' }, { id: 'interior', name: '室内与天光' }];
    const assignments = {}; const schemes = [];
    for (let i = 0; i < 6; i++) {
      const schemeId = crypto.randomUUID(); const refId = crypto.randomUUID(); const v1 = crypto.randomUUID();
      await putSourceImage({ sourceReferenceId: refId, schemeId, blob: blobs[i] });
      const mods = modulesFor(i);
      const versions = [{ versionId: v1, versionNumber: 1, origin: 'initial-confirm', createdAt: '2026-09-29T08:30:00.000Z',
        modulesSnapshot: mods, principleText: PRINCIPLE, sourceReferenceIds: [refId] }];
      if (i === 0) versions.push({ versionId: crypto.randomUUID(), versionNumber: 2, origin: 'revision-confirm', createdAt: '2026-09-30T09:00:00.000Z',
        modulesSnapshot: mods.map(m => m.key === 'lighting_atmosphere' ? { ...m, value: '保留柔和阴天光照，强化玻璃窗带的温暖室内光，保持山体纹理与空气透视。', source: 'user', reviewState: 'modified' } : m),
        sourceReferenceIds: [refId], baselineVersionId: v1, principleText: PRINCIPLE,
        changeSummary: [{ moduleKey: 'lighting_atmosphere', changeType: 'direct-edit' }] });
      const scheme = normalizePromptScheme({ schemeId, name: names[i] + ' · 演示方案', projectName: names[i], category: '文化建筑',
        overallConfirmedAt: '2026-09-30T09:00:00.000Z', updatedAt: new Date(Date.UTC(2026,8,30,10) - i * 60000).toISOString(),
        sourceReferences: [{ sourceReferenceId: refId, schemeId, displayName: names[i] + '参考图', sourceType: 'file', mimeType: 'image/png',
          byteSize: blobs[i].size, assetState: 'available', tags: i === 0 ? ['山地', '混凝土', '暖光'] : ['空间', '材质'] }], versions });
      schemes.push(scheme); assignments[schemeId + ':' + refId] = ['mountain', 'courtyard', 'interior', 'interior', 'interior', 'mountain'][i];
    }
    const builderId = crypto.randomUUID(); const references = [];
    for (let i = 0; i < 3; i++) {
      const sourceReferenceId = crypto.randomUUID(); await putSourceImage({ sourceReferenceId, schemeId: builderId, blob: blobs[i] });
      references.push({ id: crypto.randomUUID(), sourceReferenceId, name: names[i] + '参考图', result: { modules: modulesFor(i) } });
    }
    const chosen = ['scene_subject', 'materials_surfaces', 'landscape_context', 'view_composition', 'lighting_atmosphere', 'image_expression'];
    const bindings = Object.fromEntries(chosen.map(k => [k, references[k === 'materials_surfaces' ? 1 : k === 'lighting_atmosphere' ? 2 : 0].id]));
    const builderModules = normalizeIntentModules(INTENT_MODULES.map(d => {
      const ref = references.find(r => r.id === bindings[d.key]);
      return ref ? ref.result.modules.find(m => m.key === d.key) : { key: d.key, enabled: false };
    }));
    await chrome.storage.local.set({
      [STORAGE.importedAssetsV4]: imported, [STORAGE.promptSchemesV3]: schemes,
      [STORAGE.promptGroupsV4]: { groups, assignments }, [STORAGE.privacyAccepted]: true,
      [STORAGE.assetAIConsent]: true, [STORAGE.assetVectorConsent]: true,
      [STORAGE.hiddenProjectTypesV4]: ['办公建筑'], [STORAGE.captureProjectViewV4]: 'large',
      [STORAGE.projectTypeOrderV4]: ['文化建筑', '教育建筑', '社区建筑'],
      [STORAGE.librarySearchHistoryV4]: ['混凝土 暖光', '木构 庭院', '自然顶光', '图书馆', '山地建筑'],
    });
    await chrome.storage.session.set({ [STORAGE.builderV3]: { builderId, name: '公共建筑氛围研究 · 演示方案', references, modules: builderModules, principleText: PRINCIPLE, bindings },
      [STORAGE.generatedResultV3]: { generatedResultId: crypto.randomUUID(), imagePayload: await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blobs[0]); }), displayName: '山谷美术馆效果图 · 演示', mimeType: 'image/png' } });
  }, { board });
  const settle = async p => { await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800); };
  const save = async (p, name) => { await settle(p); await p.screenshot({ path: shotPath(name), fullPage: false }); };
  await page.goto(origin + '/library.html');
  await page.waitForSelector('.capture-project-card img');
  await save(page, '01-project-library-1280x800.png');
  await page.locator('.capture-all').click();
  await page.locator('.capture-card-main').first().click();
  await page.waitForSelector('#capture-detail img');
  await page.locator('#capture-detail').evaluate(node => { node.scrollTop = node.scrollHeight - node.clientHeight; });
  await save(page, '02-image-description-1280x800.png');
  await page.locator('#show-prompts').click();
  await page.waitForSelector('#library-grid img');
  await page.locator('#library-grid .asset-card-main').first().click();
  await save(page, '03-prompt-library-1280x800.png');

  const panel = await context.newPage(); panel.on('pageerror', e => errors.push(e.message));
  await panel.setViewportSize({ width: 420, height: 700 });
  await panel.goto(origin + '/sidepanel.html');
  await panel.waitForSelector('.reference-section img:not([hidden])');
  await panel.waitForSelector('#session-status[data-state]', { timeout: 20000 });
  await panel.evaluate(() => window.scrollTo(0, 260));
  await settle(panel);
  await panel.screenshot({ path: shotPath('_reference-panel.png') });
  await panel.locator('.builder-summary').evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 120));
  await settle(panel);
  await panel.screenshot({ path: shotPath('_prompt-panel.png') });
  await panel.locator('[data-tab="optimize"]').click();
  await panel.locator('#scheme-select').selectOption({ index: 1 });
  const demoImage = await page.evaluate(async () => {
    const rows = await chrome.storage.local.get('importedAssetsV4');
    const { getSourceImage } = await import('./source-image-store.mjs');
    const record = await getSourceImage(rows.importedAssetsV4[0].id);
    return await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(record.blob); });
  });
  await panel.locator('#generated-file').setInputFiles({ name: '山谷美术馆效果图-演示.png', mimeType: 'image/png', buffer: Buffer.from(demoImage, 'base64') });
  await panel.waitForFunction(() => document.querySelector('#generated-image').naturalWidth > 0);
  await panel.locator('#run-evaluation:not([disabled])').waitFor({ state: 'visible' });
  await panel.evaluate(() => window.scrollTo(0, 160));
  await save(panel, '_optimize-panel.png');

  const frame = await context.newPage();
  const imageData = async name => 'data:image/png;base64,' + (await readFile(shotPath(name))).toString('base64');
  const css = `*{box-sizing:border-box}body{margin:0;background:#f3f6f3;color:#213d30;font-family:'Microsoft YaHei UI','Segoe UI',sans-serif}header{height:105px;padding:30px 36px 18px;display:flex;align-items:center;justify-content:space-between}h1{margin:0;font-size:26px;font-weight:600}header span{font-size:14px;color:#607668}.cols{display:flex;gap:24px;padding:0 36px}figure{margin:0;width:400px}figcaption{font-size:14px;margin-bottom:10px;color:#526c5e}.shot{width:380px;display:block;border:1px solid #ccd9d0;border-radius:10px;background:white}.intro{flex:1;padding:24px 8px 0 0}h2{font-size:31px;line-height:1.5;font-weight:600;margin:10px 0 24px}.intro p{font-size:17px;line-height:1.9;color:#526c5e}.badge{font-size:13px;color:#25634b;letter-spacing:1px}.intro .sample{width:100%;border-radius:10px;margin-top:20px}footer{position:absolute;bottom:13px;left:36px;font-size:11px;color:#728478}`;
  const tile = `<img class="sample" src="${board}" alt="建筑演示素材">`;
  await frame.setContent(`<style>${css}</style><header><h1>ArchBuddy · 提示词生成</h1><span>参考图分析 → 组合编辑 → 确认入库</span></header><div class="cols"><section class="intro"><div class="badge">建筑设计参考工作流</div><h2>从视觉参考<br>形成可编辑的设计意图</h2><p>最多三张参考图<br>按维度选择与组合<br>保留原始参考和 Prompt 版本</p>${tile}</section><figure><figcaption>参考图与视觉特征</figcaption><img class="shot" src="${await imageData('_reference-panel.png')}"></figure><figure><figcaption>整体 Prompt 预览</figcaption><img class="shot" src="${await imageData('_prompt-panel.png')}"></figure></div><footer>V4 实际界面 · 演示素材与手工示例文本</footer>`);
  await save(frame, '04-prompt-builder-1280x800.png');
  await frame.setContent(`<style>${css}.large{width:690px}.large .sample{width:100%;height:340px;object-fit:cover;object-position:left top}.intro{padding-right:35px}</style><header><h1>ArchBuddy · 提示词优化</h1><span>生成图与原始提示词一起对照</span></header><div class="cols"><section class="intro large"><div class="badge">效果图迭代工作流</div><h2>导入生成效果图<br>评估偏差，保存下一版本</h2><p>选择已确认的基础 Prompt · 查看原文<br>主动发起效果评估 · 调整后确认入库</p>${tile}</section><figure><figcaption>生成图与基础提示词</figcaption><img class="shot" src="${await imageData('_optimize-panel.png')}"></figure></div><footer>V4 实际界面 · 演示素材；未调用模型，未展示虚构评估结果</footer>`);
  await save(frame, '05-prompt-optimization-1280x800.png');
  const publicNames = ['01-project-library-1280x800.png','02-image-description-1280x800.png','03-prompt-library-1280x800.png','04-prompt-builder-1280x800.png','05-prompt-optimization-1280x800.png'];
  for (const name of publicNames) {
    const file = path.join(output, name);
    const rgb = await sharp(file).removeAlpha().png().toBuffer();
    const meta = await sharp(rgb).metadata();
    if (meta.width !== 1280 || meta.height !== 800 || meta.hasAlpha) throw new Error('商店截图格式不符');
    await writeFile(file, rgb);
  }
  const blockedModelCalls = await worker.evaluate(() => self.screenshotBlockedModelCalls);
  await writeFile(path.join(output, 'capture-evidence.json'), JSON.stringify({ version: '0.6.0', createdAt: new Date().toISOString(),
    viewport: { width: 1280, height: 800 }, extensionOrigin: origin, method: 'real-unpacked-extension-isolated-profile',
    data: 'hand-authored-demo-only', sourceArtwork: 'prototype/assets/architecture-board.png', modelRequests, blockedModelCalls, pageErrors: errors,
    publicFiles: ['01-project-library-1280x800.png','02-image-description-1280x800.png','03-prompt-library-1280x800.png','04-prompt-builder-1280x800.png','05-prompt-optimization-1280x800.png'] }, null, 2) + '\n');
  console.log(JSON.stringify({ output, modelRequests, pageErrors: errors }));
} finally { await context.close(); }