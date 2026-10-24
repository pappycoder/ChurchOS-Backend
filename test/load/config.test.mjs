import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTrace } from './trace.mjs';
import { validateTarget, positiveInteger, summarize, validPayload } from './config.mjs';

test('local targets work and remote stress requires an exact explicit HTTPS host', () => {
  assert.equal(validateTarget('http://127.0.0.1:4311/api/v1/'), 'http://127.0.0.1:4311/api/v1');
  assert.throws(() => validateTarget('https://church-os-web.vercel.app/api/backend'));
  assert.throws(() => validateTarget('https://other.example/api', 'staging.example'));
  assert.throws(() => validateTarget('http://staging.example/api', 'staging.example'));
  assert.equal(
    validateTarget('https://staging.example/api/v1', 'staging.example'),
    'https://staging.example/api/v1',
  );
});
test('credentials and query parameters cannot be embedded into report target URLs', () => {
  for (const url of [
    'https://user:secret@staging.example/api',
    'http://127.0.0.1/api?token=secret',
    'file:///tmp/test',
    'http://127.0.0.1/#fragment',
  ])
    assert.throws(() => validateTarget(url, 'staging.example'));
});
test('bounded positive load levels reject invalid values', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, 10001])
    assert.throws(() => positiveInteger(n, 'load'));
  assert.equal(positiveInteger('100', 'load'), 100);
});
test('summary excludes setup requests and exposes throttling and unsent work', () => {
  const metrics = {
    http_reqs: { values: { count: 1000, rate: 100 } },
    'http_reqs{scenario:capacity}': { values: { count: 900, rate: 90 } },
    'http_req_duration{scenario:capacity}': {
      values: { med: 5, 'p(95)': 15, 'p(99)': 25 },
      thresholds: { 'p(95)<1000': { ok: true } },
    },
    request_errors: { values: { rate: 0 } },
    rate_limited: { values: { count: 4 } },
    dropped_iterations: { values: { count: 20 } },
  };
  const result = summarize({ metrics });
  assert.equal(result.requests, 900);
  assert.equal(result.p95Ms, 15);
  assert.equal(result.rateLimited, 4);
  assert.equal(result.droppedIterations, 20);
  metrics['http_req_duration{scenario:capacity}'].thresholds['p(95)<1000'].ok = false;
  assert.equal(summarize({ metrics }).passed, false);
  assert.equal(summarize({ metrics: {} }).passed, false);
});

test('empty or malformed successful bodies cannot masquerade as realistic data load', () => {
  assert.equal(validPayload('/members', { success: true, data: [] }), false);
  assert.equal(validPayload('/members', { success: true, data: {} }), false);
  assert.equal(
    validPayload('/members', { success: true, data: { data: [{ memberId: 'fixture' }] } }),
    true,
  );
  assert.equal(validPayload('/members', { success: true, data: [{ memberId: 'fixture' }] }), true);
  assert.equal(
    validPayload('/reports/financial', {
      success: true,
      data: { currency: 'NGN', grandTotal: 1000, transactionCount: 1 },
    }),
    true,
  );
  assert.equal(
    validPayload('/reports/financial', {
      success: true,
      data: { currency: 'NGN', grandTotal: 0, transactionCount: 0 },
    }),
    false,
  );
});

test('live workloads permit empty real collections but still reject malformed success bodies', () => {
  assert.equal(validPayload('/members', { success: true, data: [] }, true), true);
  assert.equal(validPayload('/members', { success: true, data: {} }, true), false);
  assert.equal(
    validPayload(
      '/reports/financial',
      { success: true, data: { currency: 'NGN', grandTotal: 0, transactionCount: 0 } },
      true,
    ),
    true,
  );
});

test('throughput uses only the scenario clock and includes requests that finish in graceful stop', () => {
  const data = {
    metrics: {
      'http_reqs{scenario:capacity}': { values: { count: 30, rate: 0.5 } },
      measurement_window_ms: { values: { max: 32000 } },
    },
  };
  const result = summarize(data, { scheduledSeconds: 30, mode: 'rps' });
  assert.equal(result.measuredSeconds, 32);
  assert.equal(result.requestsPerSecond, 30 / 32);
  assert.equal(result.rawK6RateIncludingSetup, 0.5);
  assert.equal(result.throughputClock, 'scenario span (excludes setup)');
  const burst = summarize(data, { scheduledSeconds: 60, mode: 'burst' });
  assert.equal(burst.measuredSeconds, 32);
});

test('trace counts actual simultaneous requests with nanosecond timestamps and timezone offsets', () => {
  const point = (metric, time) => JSON.stringify({ type: 'Point', metric, data: { time } });
  const trace = [
    point('capacity_request_started', '2026-10-24T10:00:00.000000001Z'),
    point('capacity_request_started', '2026-10-24T11:00:00.000000002+01:00'),
    point('capacity_request_finished', '2026-10-24T10:00:00.000000003Z'),
    point('capacity_request_started', '2026-10-24T10:00:00.000000004Z'),
    point('capacity_request_finished', '2026-10-24T10:00:00.000000005Z'),
    point('capacity_request_finished', '2026-10-24T10:00:00.000000006Z'),
  ].join('\n');
  assert.deepEqual(summarizeTrace(trace), {
    peakClientRequestsInFlight: 2,
    unclosedRequestsAtEnd: 0,
    startedRequests: 3,
  });
});

test('aborted runs do not divide completed requests by an unexecuted scheduled duration', () => {
  const data = {
    metrics: {
      'http_reqs{scenario:capacity}': { values: { count: 19 } },
      measurement_window_ms: { values: { max: 17756 } },
    },
  };
  const result = summarize(data, { scheduledSeconds: 30, mode: 'rps', endedEarly: true });
  assert.equal(result.measuredSeconds, 17.756);
  assert.equal(result.requestsPerSecond, 19 / 17.756);
});
