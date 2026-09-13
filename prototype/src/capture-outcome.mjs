export const CAPTURE_SCENARIOS = [
  'normal',
  'offline',
  'restricted',
  'unsupported',
  'inaccessible',
  'download-error',
  'staging-error',
];

export function resolveCaptureScenario(search = '') {
  const value = new URLSearchParams(search).get('scenario') ?? 'normal';
  return CAPTURE_SCENARIOS.includes(value) ? value : 'normal';
}

export function getCaptureOutcome(scenario, projectType) {
  const outcomes = {
    normal: {
      status: 'saved',
      feedback: `已下载并保存到${projectType}`,
      announce: `图片已下载并保存到${projectType}`,
    },
    offline: {
      status: 'staged',
      feedback: '已下载并暂存，打开桌面端后自动整理',
      announce: '图片已下载并离线暂存',
    },
    restricted: {
      status: 'restricted',
      feedback: '网站限制了原图访问，请在有权限的页面重试',
      announce: '网站限制原图访问，图片未保存',
    },
    unsupported: {
      status: 'unsupported',
      feedback: '暂不支持 SVG 或动态图片，请选择 JPG、PNG 或 WebP',
      announce: '图片格式暂不支持，图片未保存',
    },
    inaccessible: {
      status: 'inaccessible',
      feedback: '原图地址已失效，图片未保存',
      announce: '原图地址已失效，图片未保存',
    },
    'download-error': {
      status: 'download-error',
      feedback: '下载中断，图片尚未保存，可重试',
      announce: '图片下载失败，可以重试',
    },
    'staging-error': {
      status: 'staging-error',
      feedback: '暂存失败，请检查浏览器下载权限后重试',
      announce: '图片暂存失败，可以重试',
    },
  };
  return outcomes[scenario] ?? outcomes.normal;
}

export function isRetryableCaptureStatus(status) {
  return status === 'download-error' || status === 'staging-error';
}
