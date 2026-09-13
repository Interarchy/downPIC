export const PRESET_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];

export const STORAGE = {
  captureEnabled: 'capture_enabled',
  projectType: 'default_project_type',
  customTypes: 'custom_project_types',
  privacyAccepted: 'privacy_accepted_v1',
  selection: 'selected_image',
  result: 'analysis_result',
  lastDownload: 'last_download',
};

export const PRINCIPLE_TITLE = '整体生成准则';
export const PRINCIPLE = '保持待修改原图的视角与构图不变，保留原有画幅比例、透视关系、主体位置及空间布局。参考以下视觉特征进行效果表达，输出四千像素级（4K）高分辨率图像，呈现高品质建筑效果图效果：材质细腻可信、光影自然协调、画面清晰，避免明显失真、噪点与过度锐化。';
export const SECTION_TITLES = ['核心视觉特征', '场景与主体', '视角与构图', '色彩与明暗', '光照与氛围', '材料与表面', '环境与配景', '图像表现'];

export function normalizeProjectType(value) {
  return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
}

export function sanitizePathSegment(value, fallback = '未命名项目') {
  const normalized = String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/g, '')
    .replace(/\.+$/g, '')
    .trim();
  const safe = normalized && normalized !== '.' && normalized !== '..' ? normalized : fallback;
  return safe.slice(0, 80);
}

export function extensionFromUrl(url, mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/jpeg') return 'jpg';
  try {
    const candidate = new URL(url).pathname.split('.').pop()?.toLowerCase();
    if (['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(candidate)) return candidate === 'jpeg' ? 'jpg' : candidate;
  } catch {}
  return 'jpg';
}

export function dataUrlParts(dataUrl) {
  const match = String(dataUrl ?? '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('图片数据格式无效');
  return { mimeType: match[1], base64: match[2] };
}

export function parseAnalysisSections(text, minimum = 4) {
  const cleaned = String(text ?? '').replace(/```[a-zA-Z]*\s*/g, '');
  const matches = [...cleaned.matchAll(/【([^】]{1,20})】/g)];
  const collected = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? cleaned.length;
    const title = matches[index][1].trim();
    const body = cleaned.slice(start, end).trim();
    if (SECTION_TITLES.includes(title) && body && !collected.has(title)) collected.set(title, body);
  }
  const sections = SECTION_TITLES.filter(title => collected.has(title))
    .map(title => ({ title, text: collected.get(title) }));
  if (sections.length < minimum) throw new Error(`模型只返回了 ${sections.length} 个有效分项，请重试`);
  return [{ title: PRINCIPLE_TITLE, text: PRINCIPLE }, ...sections];
}

export function serializeSections(sections) {
  return (sections ?? []).map(section => `【${section.title}】\n${section.text}`).join('\n\n');
}
