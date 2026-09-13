export const LIBRARY_SETUP_MODES = ['create', 'connect', 'move'];

export function normalizeLibraryPath(value) {
  return String(value ?? '').trim().replace(/[\\/]+$/, '');
}

export function validateLibraryPath(value) {
  const path = normalizeLibraryPath(value);
  if (!path) return { valid: false, path, error: '请选择素材库文件夹' };
  if (!/^[A-Za-z]:\\/.test(path)) return { valid: false, path, error: '请选择 Windows 本地磁盘中的文件夹' };
  if (/^C:\\Program Files(?:\\|$)/i.test(path)) {
    return { valid: false, path, error: '此位置需要管理员权限，请选择个人文件夹或其他磁盘' };
  }
  return {
    valid: true,
    path,
    checks: [
      { label: '读取文件', passed: true },
      { label: '写入图片', passed: true },
      { label: '创建项目文件夹', passed: true },
    ],
  };
}

export function getLibrarySetupSummary(mode, path) {
  const normalizedPath = normalizeLibraryPath(path);
  const descriptions = {
    create: '将在所选位置创建新的建筑素材库，不移动其他文件。',
    connect: '将读取并索引已有文件，原文件位置保持不变。',
    move: '将把当前素材库迁移到新位置，完成前保留原目录。',
  };
  return {
    mode: LIBRARY_SETUP_MODES.includes(mode) ? mode : 'create',
    path: normalizedPath,
    description: descriptions[mode] ?? descriptions.create,
    folders: [
      { type: '文化建筑', project: '沿山艺术中心' },
      { type: '教育建筑', project: '林间学校' },
      { type: '办公建筑', project: '河岸创意园' },
    ],
  };
}
