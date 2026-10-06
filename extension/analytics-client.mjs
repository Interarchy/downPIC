// 页面只发送枚举、数量和随机流程标识；失败不进入产品反馈。
export function createAnalyticsClient(entry) {
  async function message(type, payload) {
    try {
      const response = await chrome.runtime.sendMessage({ type, payload });
      return response?.ok ? response : null;
    } catch { return null; }
  }
  let visited = false, visiting = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.analytics_consent_v1) visited = false;
  });
  return {
    async visit() {
      if (visited || document.hidden) return;
      if (!visiting) visiting = message('analytics.record', { eventName: 'session_started', entry })
        .then(result => { visited = result?.accepted === true; }).finally(() => { visiting = null; });
      await visiting;
    },
    record(eventName, fields = {}) { return message('analytics.record', { eventName, entry, ...fields }); },
    async task(key, taskType = 'prompt_build') {
      return (await message('analytics.task.begin', { key, taskType, entry }))?.taskId || null;
    },
    async currentTask(key) { return (await message('analytics.task.current', { key }))?.taskId || null; },
  };
}
