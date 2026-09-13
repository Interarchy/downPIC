import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.resolve(here, '..');
const hostPath = path.join(spikeRoot, 'native-host', 'bin', 'SuoyinshiCaptureHost.exe');
const tempParent = path.join(spikeRoot, '.test-runtime');

function envelope(captureId, temporaryPath) {
  return {
    schema_version: 1,
    message_id: `message-${captureId}`,
    type: 'capture.enqueue',
    sent_at: '2026-08-10T02:30:00Z',
    payload: {
      capture_id: captureId,
      temporary_path: temporaryPath,
      project_type_name: '文化建筑',
      page_title: '沿山艺术中心',
      page_url: 'https://example.com/project',
      image_url: 'https://example.com/image.jpg',
      site_name: 'Example',
      captured_at: '2026-08-10T02:30:00Z',
    },
  };
}

function sendNativeMessage(message, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(hostPath, [], { env: { ...process.env, ...env }, windowsHide: true });
    const chunks = [];
    const errors = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(errors).toString('utf8')));
      const buffer = Buffer.concat(chunks);
      const length = buffer.readUInt32LE(0);
      resolve(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
    });
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    child.stdin.end(Buffer.concat([header, payload]));
  });
}

test('native host imports, deduplicates, remains idempotent, and rejects path escape', async () => {
  await mkdir(tempParent, { recursive: true });
  const root = await mkdtemp(path.join(tempParent, 'case-'));
  const stagingRoot = path.join(root, 'staging');
  const runtimeRoot = path.join(root, 'runtime');
  await mkdir(stagingRoot, { recursive: true });
  const env = {
    SUOYINSHI_SPIKE_MODE: '1',
    SUOYINSHI_STAGING_ROOT: stagingRoot,
    SUOYINSHI_RUNTIME_ROOT: runtimeRoot,
  };
  const imageServer = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'image/jpeg' });
    response.end(Buffer.from('fetched-site-image'));
  });
  await new Promise((resolve) => imageServer.listen(0, '127.0.0.1', resolve));
  const imageServerUrl = `http://127.0.0.1:${imageServer.address().port}`;

  try {
    const hello = await sendNativeMessage({
      schema_version: 1,
      message_id: 'message-hello',
      type: 'app.hello',
      sent_at: '2026-08-10T02:30:00Z',
      payload: { extension_version: '0.2.0' },
    }, env);
    assert.equal(hello.type, 'app.status');
    assert.equal(hello.payload.state, 'connected');

    const fetchMessage = envelope('capture-fetch-01', '');
    fetchMessage.type = 'capture.fetch';
    fetchMessage.payload.image_url = `${imageServerUrl}/image-without-extension`;
    fetchMessage.payload.page_url = `${imageServerUrl}/source-page`;
    fetchMessage.payload.extension = 'jpg';
    delete fetchMessage.payload.temporary_path;
    const fetched = await sendNativeMessage(fetchMessage, env);
    assert.equal(fetched.payload.state, 'imported');
    assert.equal(await readFile(fetched.payload.managed_path, 'utf8'), 'fetched-site-image');

    const blockedFetchMessage = envelope('capture-fetch-02', '');
    blockedFetchMessage.type = 'capture.fetch';
    blockedFetchMessage.payload.image_url = 'https://example.com/image.jpg';
    blockedFetchMessage.payload.extension = 'jpg';
    delete blockedFetchMessage.payload.temporary_path;
    const blockedFetch = await sendNativeMessage(blockedFetchMessage, env);
    assert.equal(blockedFetch.payload.error_code, 'IMAGE_HOST_NOT_ALLOWED');

    const libraryReveal = await sendNativeMessage({
      schema_version: 1,
      message_id: 'message-library-reveal',
      type: 'library.reveal',
      sent_at: '2026-08-10T02:30:00Z',
      payload: {},
    }, env);
    assert.equal(libraryReveal.type, 'library.reveal.result');
    assert.equal(libraryReveal.payload.state, 'opened');
    assert.equal(libraryReveal.payload.simulated, true);
    assert.equal(path.resolve(libraryReveal.payload.library_root), path.resolve(runtimeRoot, 'library'));

    const firstPath = path.join(stagingRoot, 'capture-01.jpg');
    await writeFile(firstPath, Buffer.from('same-image-content'));
    const firstMessage = envelope('capture-01', firstPath);
    const imported = await sendNativeMessage(firstMessage, env);
    assert.equal(imported.payload.state, 'imported');
    assert.match(imported.payload.managed_path, /文化建筑[\\/]沿山艺术中心/);
    assert.equal((await readFile(`${imported.payload.managed_path}.source.json`, 'utf8')).includes('page_url'), true);

    const revealed = await sendNativeMessage({
      schema_version: 1,
      message_id: 'message-reveal',
      type: 'asset.reveal',
      sent_at: '2026-08-10T02:30:00Z',
      payload: { managed_path: imported.payload.managed_path },
    }, env);
    assert.equal(revealed.type, 'asset.reveal.result');
    assert.equal(revealed.payload.state, 'opened');
    assert.equal(revealed.payload.simulated, true);

    const idempotent = await sendNativeMessage(firstMessage, env);
    assert.deepEqual(idempotent, imported);

    const duplicatePath = path.join(stagingRoot, 'capture-02.jpg');
    await writeFile(duplicatePath, Buffer.from('same-image-content'));
    const duplicate = await sendNativeMessage(envelope('capture-02', duplicatePath), env);
    assert.equal(duplicate.payload.state, 'duplicate');
    assert.equal(duplicate.payload.managed_path, imported.payload.managed_path);

    const outsidePath = path.join(root, 'outside.jpg');
    await writeFile(outsidePath, Buffer.from('outside'));
    const rejected = await sendNativeMessage(envelope('capture-03', outsidePath), env);
    assert.equal(rejected.payload.state, 'failed');
    assert.equal(rejected.payload.error_code, 'PATH_OUTSIDE_STAGING');

    const rejectedReveal = await sendNativeMessage({
      schema_version: 1,
      message_id: 'message-reveal-outside',
      type: 'asset.reveal',
      sent_at: '2026-08-10T02:30:00Z',
      payload: { managed_path: outsidePath },
    }, env);
    assert.equal(rejectedReveal.payload.state, 'failed');
    assert.equal(rejectedReveal.payload.error_code, 'PATH_OUTSIDE_LIBRARY');
  } finally {
    await new Promise((resolve) => imageServer.close(resolve));
    const resolved = path.resolve(root);
    assert.equal(resolved.startsWith(path.resolve(tempParent) + path.sep), true);
    await rm(resolved, { recursive: true, force: true });
  }
});
