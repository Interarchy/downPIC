import { PROJECT_ID, STAGE, shanghaiDay } from './quota.mjs';
import { validateAnalyticsEvent } from '../extension/analytics-schema.mjs';
const DAY = 86_400_000;
const dayMs = day => Date.parse(`${day}T00:00:00+08:00`);
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && shanghaiDay(dayMs(day)) === day;
const ratio = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
const actorValid = value => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
function checkScope(row) {
  if (row?.projectId !== PROJECT_ID || row?.stage !== STAGE || !actorValid(row.actorHash)) throw new Error('导出数据项目、阶段或统计主体不匹配');
}

export function summarizeMetrics(data, { from, to, asOf = to, cohortFrom = from, cohortTo = to } = {}) {
  if (![from, to, asOf].every(validDay) || from > to || to > asOf || dayMs(to) - dayMs(from) > 6 * DAY) throw new Error('请指定不超过7天的统计周期及有效观察截止日');
  if (![cohortFrom, cohortTo].every(validDay) || cohortFrom > cohortTo || cohortTo > asOf || dayMs(cohortTo) - dayMs(cohortFrom) > 6 * DAY) throw new Error('首次使用用户组必须为不超过7天的有效日期范围');
  if (!Array.isArray(data?.events) || !Array.isArray(data?.activities)) throw new Error('导出文件需要events和activities数组');
  const coverageKeys = ['eventsFrom', 'eventsTo', 'activitiesFrom', 'activitiesTo'];
  if (!data.coverage || typeof data.coverage !== 'object' || Array.isArray(data.coverage)
      || Object.keys(data.coverage).some(key => !coverageKeys.includes(key))) throw new Error('导出覆盖范围仅允许四个日期字段');
  const coverage = Object.fromEntries(coverageKeys.map(key => [key, data.coverage[key]]));
  if (!['eventsFrom', 'eventsTo', 'activitiesFrom', 'activitiesTo'].every(key => validDay(coverage[key]))) throw new Error('必须显式提供原始事件和摘要的完整导出日期范围');
  const eventsComplete = coverage.eventsFrom <= from && coverage.eventsTo >= asOf;
  const activityComplete = coverage.activitiesFrom <= from && coverage.activitiesTo >= asOf;
  const limit = dayMs(asOf) + DAY;
  const seen = new Set();
  const events = data.events.filter(event => {
    checkScope(event);
    if (event.schemaVersion !== 2) return false;
    if (!Number.isFinite(Date.parse(event.clientOccurredAt))) throw new Error('导出事件时间无效');
    const { _id, projectId, stage, actorHash, receivedAt, expiresAt, ...payload } = event;
    // consentId不落库；仅为复用形状校验提供固定占位值，不用于计算或主体归属。
    validateAnalyticsEvent({ ...payload, consentId: '00000000-0000-4000-8000-000000000000' }, { now: Date.parse(event.clientOccurredAt) });
    const key = `${event.actorHash}:${event.eventId}`;
    if (seen.has(key) || Date.parse(event.clientOccurredAt) >= limit) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.clientOccurredAt.localeCompare(b.clientOccurredAt));
  const activityIds = new Set();
  const activities = data.activities.filter(row => {
    checkScope(row);
    if (row.schemaVersion !== 2 || activityIds.has(row.actorHash)) throw new Error('摘要版本无效或主体重复');
    activityIds.add(row.actorHash);
    if (row.firstActiveDay === undefined) return false; // 没有主动行为的撤回墓碑。
    if (!validDay(row.firstActiveDay) || !row.days || Object.keys(row.days).some(day => !validDay(day))) throw new Error('活跃摘要日期无效');
    if (!Number.isFinite(Date.parse(row.expiresAt)) || (row.withdrawnAt && !Number.isFinite(Date.parse(row.withdrawnAt)))) throw new Error('摘要保留时间无效');
    for (const state of Object.values(row.days)) if (!state || typeof state.active !== 'boolean' || typeof state.library !== 'boolean') throw new Error('摘要活跃状态无效');
    return true;
  });
  const inWeek = event => { const day = shanghaiDay(Date.parse(event.clientOccurredAt)); return day >= from && day <= to; };
  const keyFor = (event, id) => `${event.actorHash}:${event[id]}`;
  const starts = new Map();
  for (const event of events.filter(event => inWeek(event) && event.eventName === 'task_started' && event.scope === 'task' && event.taskType === 'prompt_build')) starts.set(keyFor(event, 'taskId'), event);
  const ready = new Set(), confirmed = new Set(), copied = new Set(), ended = new Set();
  const confirmationTimes = new Map();
  for (const event of events) {
    const key = keyFor(event, 'taskId'), start = starts.get(key);
    if (!start || event.clientOccurredAt < start.clientOccurredAt) continue;
    if (event.eventName === 'task_result' && event.scope === 'task') {
      ended.add(key); if (event.outcome === 'success') ready.add(key);
    }
    if (event.eventName === 'prompt_confirmed' && event.flow === 'initial') {
      confirmed.add(key); confirmationTimes.set(key, event.clientOccurredAt);
    }
    if (event.eventName === 'prompt_copied' && event.flow === 'initial' && confirmationTimes.has(key)
        && event.clientOccurredAt >= confirmationTimes.get(key)) copied.add(key);
  }
  const weekActivities = activities.map(row => ({ row, days: Object.entries(row.days).filter(([day, state]) => day >= from && day <= to && state.active === true) })).filter(item => item.days.length);
  const libraryActors = new Set(weekActivities.filter(item => item.days.some(([, state]) => state.library === true)).map(item => item.row.actorHash));
  const activeDays = {};
  for (const item of weekActivities) activeDays[item.days.length] = (activeDays[item.days.length] || 0) + 1;
  const cohort = activities.filter(row => row.firstActiveDay >= cohortFrom && row.firstActiveDay <= cohortTo);
  const cohortMayHaveExpired = dayMs(asOf) + DAY > dayMs(cohortFrom) + 60 * DAY;
  function retention(startOffset, endOffset, streak = 0) {
    let numerator = 0, denominator = 0, observing = 0, withdrawn = 0, unavailable = 0;
    for (const row of cohort) {
      const first = dayMs(row.firstActiveDay), end = first + endOffset * DAY;
      if (dayMs(asOf) < end) { observing++; continue; }
      if (row.withdrawnAt && dayMs(shanghaiDay(Date.parse(row.withdrawnAt))) <= end) { withdrawn++; continue; }
      if (cohortMayHaveExpired || !activityComplete || coverage.activitiesFrom > cohortFrom || coverage.activitiesFrom > row.firstActiveDay || Date.parse(row.expiresAt) <= end) { unavailable++; continue; }
      denominator++;
      let consecutive = 0, matched = false;
      for (let offset = startOffset; offset <= endOffset; offset++) {
        const active = row.days[shanghaiDay(first + offset * DAY)]?.active === true;
        consecutive = active ? consecutive + 1 : 0;
        if (streak ? consecutive >= streak : active) matched = true;
      }
      if (matched) numerator++;
    }
    return { ...ratio(numerator, denominator), observing, withdrawn, unavailable };
  }
  const searchStarts = new Map();
  for (const event of events.filter(event => inWeek(event) && event.eventName === 'search_started')) searchStarts.set(keyFor(event, 'requestId'), event);
  const searchActors = new Set([...searchStarts.values()].map(event => event.actorHash));
  const searchesPerActor = [...searchActors].map(actor => [...searchStarts.values()].filter(event => event.actorHash === actor).length);
  const searchResults = new Map();
  for (const event of events.filter(event => event.eventName === 'search_result')) {
    const key = keyFor(event, 'requestId');
    if (searchStarts.has(key) && event.clientOccurredAt >= searchStarts.get(key).clientOccurredAt) searchResults.set(key, event);
  }
  const successSearches = [...searchResults.values()].filter(event => event.outcome === 'success');
  const requests = new Map();
  for (const event of events.filter(event => inWeek(event) && event.eventName === 'task_started' && event.scope === 'ai')) requests.set(keyFor(event, 'requestId'), { start: event, result: null });
  for (const event of events.filter(event => event.eventName === 'task_result' && event.scope === 'ai')) {
    const request = requests.get(keyFor(event, 'requestId'));
    if (request && event.clientOccurredAt >= request.start.clientOccurredAt) request.result = event;
  }
  const ai = {};
  for (const { start, result } of requests.values()) {
    const group = ai[start.taskType] ||= { started: 0, success: 0, failed: 0, blocked: 0, observing: 0, failures: {}, durations: [], failedDurations: [] };
    group.started++;
    if (!result) { group.observing++; continue; }
    if (['quota_exceeded', 'invalid_input', 'not_configured', 'cancelled'].includes(result.errorCategory) || result.outcome === 'cancelled') { group.blocked++; continue; }
    if (result.outcome === 'success') { group.success++; group.durations.push(result.durationMs); }
    else { group.failed++; group.failedDurations.push(result.durationMs); group.failures[result.errorCategory || 'unknown_error'] = (group.failures[result.errorCategory || 'unknown_error'] || 0) + 1; }
  }
  for (const group of Object.values(ai)) {
    group.successRate = ratio(group.success, group.success + group.failed);
    group.medianMs = percentile(group.durations, .5); group.p90Ms = percentile(group.durations, .9);
    group.failedMedianMs = percentile(group.failedDurations, .5);
    delete group.durations; delete group.failedDurations;
  }
  const report = { projectId: PROJECT_ID, stage: STAGE, from, to, asOf, cohortFrom, cohortTo, coverage,
    versions: [...new Set(events.filter(inWeek).map(event => event.extensionVersion))].sort(),
    warnings: ['统计对象为参与统计的安装同意周期，非真实人数；未同意的安装不进入样本。', '离线撤回可能未送达服务端；缺失上报、卸载与观察期结束不能仅凭事件判定为流失。', '摘要固定保留60天；首次使用组可能已有成员到期时，本文件不能恢复完整分母，需使用及时保存的去主体汇总。'],
    prompt: { started: starts.size, ready: ready.size, confirmed: confirmed.size, copied: copied.size,
      noResultYet: starts.size - ended.size, completion: eventsComplete ? ratio(copied.size, starts.size) : null },
    activity: { weeklyActive: activityComplete ? weekActivities.length : null, libraryActive: activityComplete ? libraryActors.size : null, activeDays,
      firstWeekTwoDays: retention(0, 6, 2), firstWeekThreeDays: retention(0, 6, 3), fourthWeek: retention(21, 27), nextMonth: retention(28, 55) },
    search: { installations: searchActors.size, submissions: searchStarts.size,
      usage: eventsComplete && activityComplete ? ratio([...searchActors].filter(actor => libraryActors.has(actor)).length, libraryActors.size) : null,
      perInstallation: { median: percentile(searchesPerActor, .5), p90: percentile(searchesPerActor, .9) },
      succeeded: successSearches.length, empty: successSearches.filter(event => event.count === 0).length,
      failed: [...searchResults.values()].filter(event => event.outcome === 'failed').length,
      cancelled: [...searchResults.values()].filter(event => event.outcome === 'cancelled').length,
      observing: searchStarts.size - searchResults.size, medianMs: percentile(successSearches.map(event => event.durationMs), .5), p90Ms: percentile(successSearches.map(event => event.durationMs), .9) },
    ai,
    auxiliary: { savedImages: events.filter(event => inWeek(event) && event.eventName === 'image_saved').reduce((sum, event) => sum + event.count, 0),
      reusedEvents: events.filter(event => inWeek(event) && event.eventName === 'material_reused').length } };
  if (!eventsComplete) report.warnings.push('原始事件导出不完整：任务完成率、搜索使用率及AI质量比例不能作为完整周期结论。');
  if (!activityComplete || coverage.activitiesFrom > cohortFrom) report.warnings.push('活跃摘要或首次使用用户组导出不完整：相关活跃与回访指标标记未知，不补0。');
  if (!eventsComplete) for (const group of Object.values(ai)) group.successRate = null;
  return report;
}

export function metricsMarkdown(report) {
  const format = value => value && value.denominator ? `${value.numerator}/${value.denominator}（${(value.rate * 100).toFixed(1)}%）` : '未知／无成熟样本';
  const duration = value => value === null ? '未知' : `${(value / 1000).toFixed(1)}秒`;
  const a = report.activity, p = report.prompt, s = report.search;
  const eventCountsKnown = report.coverage.eventsFrom <= report.from && report.coverage.eventsTo >= report.asOf;
  return `# ArchBuddy 产品测评周报\n\n周期：${report.from}—${report.to}；观察截止：${report.asOf}；北京时间。回访用户组首次使用：${report.cohortFrom}—${report.cohortTo}。观察到的插件版本：${report.versions.join('、') || '无事件'}（本报告未按版本拆分）。\n\n`
    + `| 指标 | 结果 |\n| --- | --- |\n| 构建开始 → 可用结果 → 确认 → 复制 | ${p.started} → ${p.ready} → ${p.confirmed} → ${p.copied} |\n| 任务完成率 | ${format(p.completion)} |\n| 周活跃安装同意周期数 | ${a.weeklyActive ?? '未知'} |\n| 首周连续两日 / 三日使用率 | ${format(a.firstWeekTwoDays)} / ${format(a.firstWeekThreeDays)} |\n| 第四周 / 次月回访率 | ${format(a.fourthWeek)} / ${format(a.nextMonth)} |\n| 搜索使用率 | ${format(s.usage)} |\n| 搜索提交 / 成功 / 无结果 / 失败 / 取消 | ${s.submissions} / ${s.succeeded} / ${s.empty} / ${s.failed} / ${s.cancelled} |\n| 搜索等待中位 / P90 | ${duration(s.medianMs)} / ${duration(s.p90Ms)} |\n\n`
    + `活跃天数分布：${JSON.stringify(a.activeDays)}。尚无结果的构建任务：${p.noResultYet}；无结果状态的搜索：${s.observing}。${eventCountsKnown ? '' : '原始事件不完整，表中次数仅为导出中观察到的数量，不能视为完整周期计数。'}\n\n`
    + `| 回访窗口 | 观察中 | 已撤回 | 数据不足 |\n| --- | --- | --- |\n`
    + Object.entries({ '首周两日': a.firstWeekTwoDays, '首周三日': a.firstWeekThreeDays, '第四周': a.fourthWeek, '次月': a.nextMonth })
      .map(([name, value]) => `| ${name} | ${value.observing} | ${value.withdrawn} | ${value.unavailable} |`).join('\n')
    + '\n\n| AI 能力 | 成功率 | 中位 / P90 | 拦截 | 观察中 |\n| --- | --- | --- | --- | --- |\n'
    + Object.entries(report.ai).map(([name, value]) => `| ${name} | ${format(value.successRate)} | ${duration(value.medianMs)} / ${duration(value.p90Ms)} | ${value.blocked} | ${value.observing} |`).join('\n')
    + `\n\n辅助：成功保存/导入图片 ${report.auxiliary.savedImages} 张；素材复用事件 ${report.auxiliary.reusedEvents} 次（不同入口事件不能解释为独立资产数）。\n\n`
    + report.warnings.map(warning => `- ${warning}`).join('\n') + '\n';
}
