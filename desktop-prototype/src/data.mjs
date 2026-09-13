export const assets = [
  {
    id: 'asset-01', order: 1, crop: 'crop-01', ratio: 'wide', title: '主入口与山谷关系',
    projectType: '文化建筑', projectName: '沿山艺术中心', status: '已解析',
    tags: ['清水混凝土', '山地', '展览空间', '自然采光'],
    description: '顺应山谷展开的清水混凝土文化空间，水平开口将展厅、庭院与远山连接。',
    source: 'gooood · 2小时前',
    sourceSite: 'gooood', sourcePageTitle: '沿山艺术中心｜顺应山谷展开的文化空间',
    sourceUrl: 'https://www.gooood.cn/', sourceCapturedAt: '2小时前',
  },
  {
    id: 'asset-02', order: 2, crop: 'crop-02', ratio: 'portrait', title: '木构庭院与步廊',
    projectType: '教育建筑', projectName: '林间学校', status: '已解析',
    tags: ['木构', '庭院', '步廊', '自然采光'],
    description: '木结构教学单元围绕开放庭院布置，连续步廊形成柔和的室内外过渡。',
    source: 'ArchDaily · 昨天',
    sourceSite: 'ArchDaily', sourcePageTitle: '林间学校｜木构庭院与连续步廊',
    sourceUrl: 'https://www.archdaily.com/', sourceCapturedAt: '昨天',
  },
  {
    id: 'asset-03', order: 3, crop: 'crop-03', ratio: 'standard', title: '顶部柔光展厅',
    projectType: '文化建筑', projectName: '城市美术馆', status: '已解析',
    tags: ['清水混凝土', '展览空间', '自然采光', '静谧'],
    description: '顶部狭长天窗为混凝土展览空间引入柔和天光，空间安静克制。',
    source: 'Dezeen · 昨天',
    sourceSite: 'Dezeen', sourcePageTitle: '城市美术馆｜顶部柔光展厅',
    sourceUrl: 'https://www.dezeen.com/', sourceCapturedAt: '昨天',
  },
  {
    id: 'asset-04', order: 4, crop: 'crop-04', ratio: 'tall', title: '阅览空间与林地',
    projectType: '社区建筑', projectName: '林地社区图书馆', status: '未解析',
    tags: [],
    description: '',
    analysis: { stage: '等待上传图片', queuedAt: '2天前', retryCount: 0 },
    source: 'Pinterest · 2天前',
    sourceSite: 'Pinterest', sourcePageTitle: '林地社区图书馆｜阅览空间',
    sourceUrl: 'https://www.pinterest.com/', sourceCapturedAt: '2天前',
  },
  {
    id: 'asset-05', order: 5, crop: 'crop-05', ratio: 'standard', title: '共享中庭',
    projectType: '办公建筑', projectName: '河岸创意园', status: '解析中',
    tags: [],
    description: '',
    analysis: { stage: '正在生成图片描述', progress: 62, queuedAt: '3天前', retryCount: 0 },
    source: 'gooood · 3天前',
    sourceSite: 'gooood', sourcePageTitle: '河岸创意园｜共享中庭',
    sourceUrl: 'https://www.gooood.cn/', sourceCapturedAt: '3天前',
  },
  {
    id: 'asset-06', order: 6, crop: 'crop-06', ratio: 'portrait', title: '林间静室',
    projectType: '文化建筑', projectName: '林间礼拜堂', status: '解析失败',
    tags: [],
    description: '',
    analysis: { stage: '自动重试已停止', error: '网络连接中断，已自动重试 2 次', queuedAt: '4天前', retryCount: 2 },
    source: 'ArchDaily · 4天前',
    sourceSite: 'ArchDaily', sourcePageTitle: '林间礼拜堂｜石砌静室',
    sourceUrl: 'https://www.archdaily.com/', sourceCapturedAt: '4天前',
  },
  {
    id: 'asset-07', order: 7, crop: 'crop-07', ratio: 'wide', title: '下沉庭院与连桥',
    projectType: '办公建筑', projectName: '河岸创意园', status: '已解析',
    tags: ['庭院', '钢结构', '步廊', '自然采光'],
    description: '下沉庭院将办公组团与河岸步道连接，轻型连桥组织不同标高的公共动线。',
    source: 'Dezeen · 5天前',
    sourceSite: 'Dezeen', sourcePageTitle: '河岸创意园｜下沉庭院与连桥',
    sourceUrl: 'https://www.dezeen.com/', sourceCapturedAt: '5天前',
  },
  {
    id: 'asset-08', order: 8, crop: 'crop-08', ratio: 'standard', title: '双层木构阅览厅',
    projectType: '社区建筑', projectName: '林地社区图书馆', status: '未解析',
    tags: [],
    description: '',
    analysis: { stage: '等待上传图片', queuedAt: '6天前', retryCount: 0 },
    source: 'gooood · 6天前',
    sourceSite: 'gooood', sourcePageTitle: '林地社区图书馆｜双层木构阅览厅',
    sourceUrl: 'https://www.gooood.cn/', sourceCapturedAt: '6天前',
  },
];

export const projectTree = [
  { type: '文化建筑', count: 92, projects: ['沿山艺术中心', '城市美术馆', '林间礼拜堂'] },
  { type: '教育建筑', count: 86, projects: ['林间学校'] },
  { type: '办公建筑', count: 144, projects: ['河岸创意园'] },
  { type: '社区建筑', count: 57, projects: ['林地社区图书馆'] },
];

export const tagGroups = [
  { label: '空间', tags: ['展览空间', '阅览空间', '庭院', '中庭'] },
  { label: '材料', tags: ['清水混凝土', '木构', '砖', '石材', '玻璃'] },
  { label: '构造', tags: ['钢结构', '步廊'] },
  { label: '形态', tags: ['山地', '林地'] },
  { label: '氛围', tags: ['自然采光', '静谧'] },
];

export const searchHistory = [
  '有柔和天光的混凝土文化空间',
  '安静的林间阅读空间',
  '带庭院的木结构学校',
];
