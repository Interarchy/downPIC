import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, ERROR_HINTS, describeApiError } from '../api-client.mjs';

test('每个错误码都有面向用户的中文提示，不留空白', () => {
  const codes = [
    'NOT_CONFIGURED', 'IMAGE_REJECTED', 'ANALYSIS_FORMAT_INVALID', 'UPSTREAM_TIMEOUT',
    'UPSTREAM_FAILED', 'FORMAT_MISMATCH', 'UNSUPPORTED_FORMAT', 'BODY_TOO_LARGE',
    'LIBRARY_ROOT_MISSING', 'FORBIDDEN', 'NETWORK',
  ];
  for (const code of codes) {
    assert.ok(ERROR_HINTS[code], `${code} 缺少提示文案`);
    assert.match(ERROR_HINTS[code], /[一-龥]/, `${code} 的提示应当是中文`);
  }
});

test('服务端返回的错误码映射成对应的提示', () => {
  assert.equal(describeApiError(new ApiError('NOT_CONFIGURED', 'x')), ERROR_HINTS.NOT_CONFIGURED);
  assert.equal(describeApiError(new ApiError('BODY_TOO_LARGE', 'x')), ERROR_HINTS.BODY_TOO_LARGE);
});

test('服务端新加了错误码时退回它自己的文案，而不是显示 undefined', () => {
  assert.equal(describeApiError(new ApiError('SOMETHING_NEW', '服务端的新说明')), '服务端的新说明');
  assert.equal(describeApiError(new ApiError('SOMETHING_NEW', '')), '未知错误');
});

test('非 ApiError 的异常不会把堆栈泄露给用户', () => {
  const hint = describeApiError(new TypeError('Cannot read properties of undefined'));
  assert.equal(hint, '出现未预期的错误，请重试。');
  assert.ok(!hint.includes('undefined'));
});
