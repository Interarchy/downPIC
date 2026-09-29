import { pruneVectors, readVectors, textFingerprint, vectorScore, writeVectors } from './library-vector-index.mjs';

const VECTOR_MODEL = 'kinfra-text-embedding-0.6b';
const VECTOR_DIMENSIONS = 1024;
const INDEX_BATCH = 32;

function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function keywordMatches(items, query, textFor) {
  const needle = normalize(query);
  if (!needle) return items;
  const terms = needle.split(/[\s,，、；;。]+/).filter(Boolean);
  return items.map((item, index) => {
    const haystack = normalize(textFor(item));
    let score = haystack.includes(needle) ? 20 : 0;
    for (const term of terms) if (haystack.includes(term)) score += 2 + Math.min(term.length, 10);
    return { item, index, score };
  }).filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.item);
}

function validVectors(result, count) {
  if (result?.model !== VECTOR_MODEL || !Array.isArray(result.vectors) || result.vectors.length !== count
      || result.vectors.some(vector => !Array.isArray(vector) || vector.length !== VECTOR_DIMENSIONS
        || vector.some(value => !Number.isFinite(value)))) throw new Error('向量结果格式或模型版本不匹配');
  return result.vectors;
}

export function createSemanticSearch(embed, namespace) {
  let generation = 0;
  let indexing = null;
  const indexDocuments = async (documents, onProgress = () => {}) => {
    const usable = documents.filter(item => String(item.text || '').trim())
      .map(item => ({ id: String(item.id), text: String(item.text).slice(0, 2000) }));
    // Local deletion must finish even when the provider is offline or unconfigured.
    await pruneVectors(namespace, new Set(usable.map(item => item.id)));
    const fingerprints = await Promise.all(usable.map(item => textFingerprint(item.text)));
    const records = await readVectors(namespace);
    const missing = usable.map((item, index) => ({ ...item, fingerprint: fingerprints[index] }))
      .filter(item => records.get(item.id)?.model !== VECTOR_MODEL || records.get(item.id)?.fingerprint !== item.fingerprint
        || records.get(item.id)?.vector?.length !== VECTOR_DIMENSIONS);
    const known = new Map([...records.values()].filter(row => row.model === VECTOR_MODEL && row.vector?.length === VECTOR_DIMENSIONS)
      .map(row => [row.fingerprint, row.vector]));
    const groups = new Map();
    for (const item of missing) {
      if (!groups.has(item.fingerprint)) groups.set(item.fingerprint, []);
      groups.get(item.fingerprint).push(item);
    }
    const unique = [...groups.values()];
    let done = 0;
    for (let offset = 0; offset < unique.length; offset += INDEX_BATCH) {
      const batch = unique.slice(offset, offset + INDEX_BATCH);
      const needModel = batch.filter(group => !known.has(group[0].fingerprint));
      if (needModel.length) {
        const vectors = validVectors(await embed({ texts: needModel.map(group => group[0].text) }), needModel.length);
        needModel.forEach((group, index) => known.set(group[0].fingerprint, vectors[index]));
      }
      const rows = batch.flatMap(group => group.map(item => ({ id: item.id, fingerprint: item.fingerprint,
        model: VECTOR_MODEL, vector: known.get(item.fingerprint) })));
      await writeVectors(namespace, rows);
      for (const row of rows) records.set(row.id, row);
      done += rows.length;
      onProgress(done, missing.length);
    }
    return records;
  };
  const enqueue = action => {
    // Reserve a place in the queue before awaiting; refreshes must not duplicate model calls.
    const task = (indexing || Promise.resolve()).catch(() => {}).then(action);
    indexing = task;
    const release = () => { if (indexing === task) indexing = null; };
    task.then(release, release);
    return task;
  };
  return {
    query: '', ids: [], status: '', busy: false,
    clear() { generation++; this.query = ''; this.ids = []; this.status = ''; },
    select(items, query, key, textFor) {
      if (!query.trim()) return items;
      const lexical = keywordMatches(items, query, textFor);
      if (this.query !== query.trim()) return lexical;
      const seen = new Set(lexical.map(item => String(key(item))));
      const byId = new Map(items.map(item => [String(key(item)), item]));
      return [...lexical, ...this.ids.map(id => byId.get(id)).filter(item => item && !seen.has(String(key(item))))];
    },
    async prime(documents) { return enqueue(() => indexDocuments(documents)); },
    async prune(documents) {
      return enqueue(() => pruneVectors(namespace, new Set(documents
        .filter(item => String(item.text || '').trim()).map(item => String(item.id)))));
    },
    async run(query, documents, update) {
      if (this.busy) return;
      const version = ++generation;
      this.query = query.trim(); this.ids = []; this.busy = true;
      this.status = '已显示关键词结果；正在检查本地向量索引…'; update();
      try {
        const records = await enqueue(() => indexDocuments(documents, (done, total) => {
          if (version !== generation) return;
          this.status = `已显示关键词结果；首次建立索引 ${done} / ${total} 项`;
          update();
        }));
        if (version !== generation) return;
        this.status = '已显示关键词结果；正在生成一次查询向量…'; update();
        const [queryVector] = validVectors(await embed({ texts: [this.query] }), 1);
        if (version !== generation) return;
        const scored = documents.map(item => ({ id: String(item.id), score: vectorScore(queryVector, records.get(String(item.id))?.vector) }))
          .filter(row => row.score >= 0.35).sort((a, b) => b.score - a.score);
        this.ids = scored.slice(0, Math.min(40, Math.max(12, Math.ceil(documents.length * 0.1)))).map(row => row.id);
        this.status = `关键词与本地向量结果已合并 · 语义候选 ${this.ids.length} 项`;
      } catch (error) {
        if (version === generation) this.status = '已保留关键词结果；向量检索未完成：' + error.message;
      } finally { this.busy = false; update(); }
    },
  };
}
