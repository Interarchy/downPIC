# ArchBuddy 连续滚动展示站

2026-10-05第六版：定位→01方案创作中的断点→02工作链路与产品机会→03我们的产品思路→04三大功能→下载与安装。02桌面并排比较两个业务流程，窄屏依次展示。

方案创作链路保留三框闭环，采集/图库两处产品机会；AI链路为参考/反推/外部生图/迭代/词库五个完整步骤，四处产品机会，生成与迭代之间双向循环。外部生图是完整等高框，明确ArchBuddy未介入；人工创作没有产品标记。六个玫红块沿用01断点色，上行A与ArchBuddy品牌，下行具体贡献，位于步骤大框内。

原A路径、Lucide官方sprite与许可、顶部初始实色/下滑透明渐变固定、章节数字及桥接说明沿用。功能结论单行“三大功能支撑两条业务链路”。网页不调用模型、收集用户数据或统计。插件0.6.0ZIP与用户测试集7z原字节不变，旧五页和前五版源码/发布清单保留。

本地预览：http://127.0.0.1:8766/mockups/archbuddy-showcase/
白名单构建：cloudbase/scripts/build-showcase-site.mjs，输出cloudbase/dist/showcase-parallel-workflows-20261005/site，仅23公开文件。开发配置、README、审阅和日志不上传。
公网：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/
默认域名首次提醒等待3秒确认；本轮发布/最终验收以docs/ARCHBUDDY_SHOWCASE_SITE.md为准。

第七版store-entry-20261005：首页Slogan采用“打通创作断点，让设计思路一路向前。”；两处插件按钮名称保持，普通导航到用户提供的Chrome商店商品，移除下载属性。图片测试集和安装说明按本轮限定保持，旧ZIP文件留存历史。构建目录改为cloudbase/dist/showcase-store-entry-20261005/site，23文件；本轮最终发布状态见展示站文档。

第八版soft-opportunities-20261006：02机会高亮改浅暖粉/柔边框/深绿字，只减少色彩重量，保留原版式、六标记、Slogan与商店/测试集入口。构建输出cloudbase/dist/showcase-soft-opportunities-20261006/site。独立定向颜色验收与部署状态见展示站文档。

第九版store-install-20261006：05安装教程改Chrome商店线上安装、固定插件后打开功能菜单。旧扩展地址复制控件/JS监听移除，测试集导入说明保留。构建输出cloudbase/dist/showcase-store-install-20261006/site，23文件，最终发布状态见展示站文档。

第十版pain-summary-20261006：01流程图下以三列大号红字归拢建筑师核心痛点，手机竖排。原节点小提示移入总结，流程步骤/连接断点保持。构建输出cloudbase/dist/showcase-pain-summary-20261006/site，23文件。

第十版已上线，独立本地33项/公网38项定向检查通过，1440/1024/390/360px无版式异常，原公网地址不变，元数据010。

第十一版unified-pains-20261006：01采用用户选定的暖白对应分区一体图，无方框描边，首句逐张机械保存。只改01及CSS/缓存标识，输出cloudbase/dist/showcase-unified-pains-20261006/site，23文件。最终状态见展示站文档。

第十一版已上线并验收：独立本地25项/公网29项、6张新截图通过，元数据011，原网址保持。暖白一体/无描边/逐张机械保存均已确认。

第十二版hero-align-20261006：取消宽屏首屏截图右侧70px外溢，对齐导航右边界。滚动方案独立在本地，待用户选择，不进入这次发布。


第十二版012已上线并验收：本地27项/4图、公网22项/3图通过，图片外框右缘误差0px，23公开资源/范围/隐私保护通过。正式站尚未加入滚动动效。


第十三版scroll-reveal-20261006：用户已选择方案1，01–05仅首次轻量进入，正式站无方案切换控件。构建沿用23公开白名单，验收结果见展示站文档。


第十三版013已上线并验收：本地/公网各1440/390两场景、8关键截图通过，01–05首次浮现且回滚不重播，异常0。资源/范围/隐私保护通过，原公网网址保持。


2026-10-07第十四版reference-collection-20261007/014已上线：01流程首节点改为收集参考图。仅HTML词句和缓存标识变化，公网桌面/手机13项2截图通过，原排版/方案1动效保持。


2026-10-16 selected-workflows：用户已选01最终琥珀环形断点图与02双栏紧凑回环，共用深绿底和琥珀橙。图解在独立problem-section.css/js、workflow-section.css/js，保留原页面滚动进入。白名单构建输出cloudbase/dist/showcase-selected-workflows-20261016/site，27个公开文件。发布状态见docs/ARCHBUDDY_SHOWCASE_SITE.md最新记录。


2026-10-16第十六版motion-install-20261016：已选浅底接力正式上线。01三断点按滚动强调/说明逐条显露、圆环内侧两条链路，之后与02左右接力；05改全宽墨绿。正式页无比较控件，窄屏纵向阅读。29文件白名单输出cloudbase/dist/showcase-motion-install-20261016/site，元数据016/SUCCESS；详见展示站文档和本轮验收报告。

2026-10-16第十七版proportion-white-install-20261016：针对2436×1240公网图幅，01/02深绿容器宽屏最大1640×900px，圆图550px、02节点176×116px并同步放大文字；05黄色强调改白。29文件限定输出cloudbase/dist/showcase-proportion-white-install-20261016/site，元数据017/SUCCESS，验收见展示站文档。

## 2026-10-23：03/04 纳入 Canvas 统一产品方向（仅本地）

用户提出插件与 Canvas 未来合并为统一产品。本轮只更新展示层：03 以采集图片、提示词编写与迭代、效果图生成与优化三个创作环节连接共享图词资产底座；04 调整为上方采集/提示词/Canvas 三项功能，下方第04项资产沉淀。延续 #153B2D、浅绿与 #FFAF45 琥珀色，复用官方 Lucide sprite。

源码依据：Interarchy/archbuddy-canvas 的 develop README 明确独立开发与未来整合；用户提到的方案迭代节点位于 feature/canvas-workbench，而非 develop。已读取该分支提交 5637107d238fba3b7aa61eee28811e5e1a5e5d45 的 src/components/studio/StudioIterationNode.tsx、src/lib/studio/nodeCatalog.ts、src/lib/studio/comparisonAnalysis.ts，确认源码包含底图与生成图拖动对比、选择已有版本继续修改、按轮保存提示词/输入/结果。官网 Canvas 图为明确标记的功能示意，不是假造实际截图，也不代表真实模型输出质量已验证。

02 保留现有插件的五步链路与四处介入，只将范围文字明确为插件当前能力；03/04 明示 Canvas 独立开发、后续整合，避免下载商店插件即可使用画布的误读。未新增插件入口、跨端通信、账号同步、共享存储或云端执行。

本地版本 canvas-product-20261023；新增 product-section.css 并登记进30文件构建白名单。输出 cloudbase/dist/showcase-canvas-product-20261023/site；构建资源引用、下载包哈希与疑似凭据检查通过，app.js/workflow-section.js 语法检查通过，限定文件 git diff --check 通过。浏览器视觉记录见 opendesign/review/archbuddy-canvas-product-20261023/。

仅本地预览，未部署公网、未提交或推送 Git；公网仍为017。没有访问或变更云端资源、用户数据、身份、日志、密钥、额度和预算，也未修改账号积分工作区。

## 2026-10-23：展示站第018版移除首屏和测试集，加入 Edge 商店

用户要求首页直接从01开始，03删除两处产品方向说明并将橙色连接改深绿、资产底座图标改白，04底座橙色改白；05取消图片测试集入口及教程，新增用户提供的 Edge 加载项商品链接，与 Chrome 商店并列，并将安装步骤改为双浏览器通用。

实现沿用本地 Canvas 产品版本，03/04仍保留三项创作能力与图词资产底座。无首屏后，01断点 A 初始显现，B/C仍随下滑出现，避免右侧初始空白。仅移除测试集公开构建与云端对象，本地原始7z归档保留用于历史溯源；旧ZIP仍属于历史公开资源，不作为首页下载入口。

发布只更新已登记的 archbuddy / development / archbuddy-dev-showcase 静态应用与 archbuddy/dev/showcase/ 前缀。发布前只读核对017/SUCCESS、前缀29文件与删除预演单命中1对象，原隐私页200、6364字节、SHA256 D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8。构建29文件4002157字节、白名单/资源引用/ZIP哈希/疑似凭据检查通过；app deploy退出0，元数据 archbuddy-dev-showcase-018/SUCCESS。随后只删除 archbuddy/dev/showcase/downloads/ArchBuddy-test-images.7z 一项，删除成功。发布后固定前缀29/29与清单精确一致、额外0、临时配置0；主域29/29资源SHA256匹配，本页200/新版本与Edge链接存在/无hero或测试集文字；旧测试集URL加查询参数HEAD404，隐私页哈希不变。临时cloudbaserc.json已移除。

本地独立浏览器1440×1000、1920×1080、390×844核验01首屏、01→02接力、03/04色彩、05双商店、无溢出和脚本/资源错误；详情见 opendesign/review/archbuddy-no-hero-edge-20261023/report.md。Edge外部商店页面无法从此环境打开，仅核对页面href与用户给出的链接一致，未验证商品内容或安装。没有变更插件、后端、用户数据、身份、日志、密钥、额度、预算、共享配置或其他项目。未提交或推送Git。

## 2026-10-23：02 创作全链路图

用户将原来两张独立链路图合成一张图。共同起点是“采集参考图”，上支路进入由设计师主导的“方案创作”，下支路进入“反推与迭代提示词→生成与优化效果图→迭代提示词与效果图”，最后均汇入“沉淀图词库”。仅方案创作不标 ArchBuddy；Canvas 仍在04标示为独立开发。02入场后上路先画完，下路随后逐步出现；窄屏改为纵向共用起止点、两侧回环。源码仍为 workflow-section.css/js 和 index.html，发布构建为 cloudbase/dist/showcase-full-chain-20261023/site。

## 2026-10-23：02 卡片居中

全链路图各节点采用统一的卡片高度、文字间距和居中对齐；共用图词库卡片略大。移除上下两条装饰标签与横线，其中下方标签此前被采集卡片遮挡，只露出“A”。卡片内黄色ArchBuddy品牌标记保持一致，分支关系与入场时序不变。版本centered-flow-20261023，29文件白名单构建输出cloudbase/dist/showcase-centered-flow-20261023/site，发布与核验见展示站文档。

## 2026-10-23：03 交互展示

三张创作卡支持翻面：堆叠建筑参考图、逐行结构化提示词、同一建筑效果版本拖动对比。资产底座点击或向下拖动展开真实项目图库截图。前两张桌面悬停可翻面，三张均支持点击、键盘和触屏；示意生成图与真实图库截图有明确标注。第021版已部署既有 CloudBase 展示站，独立验收见 opendesign/review/archbuddy-concept-interactions-20261023/。

## 2026-10-23：03 全悬停版

三张创作卡和图词资产底座在桌面均以悬停触发，效果图翻面后自动缓慢拉帘；触屏仍轻点操作。连接圆标始终位于卡片上层。图库展开图只保留插件实际图库截图。05下载与安装及顶部下载体验入口已移除。构建版本hover-concept-20261023，第022版已发布并核验；记录见opendesign/review/archbuddy-hover-concept-20261023/。

## 2026-10-23：图词资产展开后保持打开

图库悬停展开后不再因鼠标离开而自动收起，向下滚动可连续阅读完整界面；触屏仍用轻点操作。第023版已发布，证据见opendesign/review/archbuddy-persistent-library-20261023/。

## 2026-10-23：02 底部收束

去掉01/02深绿舞台下方的小型章节提示与进度条；适度压缩桌面舞台高度和02完成后的空白，保留01→02接力及02图解的六节点/六线。第024版已发布并核验，证据见opendesign/review/archbuddy-workflow-trim-20261023/。
