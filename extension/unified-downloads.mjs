const KEY = 'archbuddy-unified-downloads-v1';
export function createUnifiedDownloads(client) {
  let queue = Promise.resolve();
  const mutate = operation => {
    queue = queue.catch(() => {}).then(async () => {
      const data = await chrome.storage.local.get(KEY);
      const rows = data[KEY] || {};
      const result = await operation(rows);
      await chrome.storage.local.set({ [KEY]: rows });
      return result;
    });
    return queue;
  };
  async function settle(downloadId, outcome) {
    const data = await chrome.storage.local.get(KEY);
    const entry = Object.values(data[KEY] || {}).find(row => row.downloadId === downloadId);
    if (!entry || entry.settled) return;
    return settleEntry(entry, outcome);
  }
  async function settleEntry(entry, outcome) {
    await mutate(rows => { rows[entry.requestId].outcome = outcome; });
    let accountId;
    try { accountId = await client.identity(); } catch { return; }
    if (entry.accountId !== accountId) return;
    await client.api('/v1/downloads/settle', { method: 'POST', expectedAccountId: accountId,
      body: { reservationId: entry.reservationId, outcome } });
    await mutate(rows => { rows[entry.requestId].settled = true; });
    void client.refresh().catch(() => {});
  }
  return {
    async download(options) {
      const accountId = await client.identity();
      const requestId = crypto.randomUUID();
      const reserved = await client.api('/v1/downloads/reserve', { method: 'POST', expectedAccountId: accountId, body: { requestId } });
      const entry = { accountId, requestId, reservationId: reserved.reservationId, createdAt: Date.now(), settled: false };
      await mutate(rows => { rows[requestId] = entry; });
      let downloadId;
      try { downloadId = await chrome.downloads.download(options); }
      catch (error) {
        // Chrome 明确拒绝创建下载时才释放；网络超时或进程退出不猜测退款。
        await mutate(rows => { rows[requestId].outcome = 'failed'; });
        await client.api('/v1/downloads/settle', { method: 'POST', expectedAccountId: accountId, body: { reservationId: entry.reservationId, outcome: 'failed' } })
          .then(() => mutate(rows => { rows[requestId].settled = true; rows[requestId].outcome = 'failed'; })).catch(() => {});
        throw error;
      }
      await mutate(rows => { rows[requestId].downloadId = downloadId; });
      const [download] = await chrome.downloads.search({ id: downloadId });
      if (download?.state === 'complete') void settle(downloadId, 'completed').catch(() => {});
      if (download?.state === 'interrupted') void settle(downloadId, 'failed').catch(() => {});
      return downloadId;
    },
    async changed(change) {
      if (change.state?.current === 'complete') await settle(change.id, 'completed');
      if (change.state?.current === 'interrupted') await settle(change.id, 'failed');
    },
    async reconcile() {
      const data = await chrome.storage.local.get(KEY);
      for (const entry of Object.values(data[KEY] || {})) {
        if (entry.settled) continue;
        const [download] = Number.isInteger(entry.downloadId) ? await chrome.downloads.search({ id: entry.downloadId }) : [];
        const outcome = entry.outcome || (download?.state === 'complete' ? 'completed' : download?.state === 'interrupted' ? 'failed' : null);
        if (outcome) await settleEntry(entry, outcome);
      }
    },
  };
}
