export const READ_PATHS = [
  '/members?page=1&limit=20',
  '/members?page=2&limit=20&search=Member',
  '/visitors?page=1&limit=20',
  '/services?page=1&limit=20',
  '/reports/financial?startDate=2026-01-01&endDate=2026-12-31&currency=NGN',
];

export const LIVE_READ_PATHS = [
  '/members?page=1&limit=20',
  '/visitors?page=1&limit=20',
  '/services?page=1&limit=20',
  '/giving/transactions?page=1&limit=20',
  '/reports/financial?startDate=2026-01-01&endDate=2026-12-31&currency=NGN',
];

export function validateTarget(raw, allowedRemote = '') {
  // k6 has no built-in WHATWG URL; accept only a narrow, unambiguous API URL shape.
  const match =
    /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?(\/[a-z0-9_./-]*)?$/i.exec(
      String(raw),
    );
  if (!match)
    throw new Error('Use a plain HTTP(S) API base URL without credentials, query or fragment');
  const [, scheme, host, port, pathname = ''] = match;
  if (port && (Number(port) < 1 || Number(port) > 65535)) throw new Error('Invalid port');
  const hostname = host.toLowerCase();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  if (!local && (scheme.toLowerCase() !== 'https' || allowedRemote !== hostname))
    throw new Error('Remote load requires HTTPS and an exact --allow-remote hostname');
  return `${scheme.toLowerCase()}://${hostname}${port ? `:${port}` : ''}${pathname}`.replace(
    /\/$/,
    '',
  );
}

export function positiveInteger(value, label, maximum = 10000) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
    throw new Error(`${label} must be an integer from 1 to ${maximum}`);
  return number;
}

export function summarize(data, { scheduledSeconds = 0, mode = 'users', endedEarly = false } = {}) {
  const metric = (name) => data.metrics[name]?.values ?? data.metrics[name] ?? {};
  const thresholds = Object.values(data.metrics).flatMap((item) =>
    Object.values(item.thresholds ?? {}),
  );
  const count = metric('http_reqs{scenario:capacity}').count ?? 0;
  const elapsed = metric('measurement_window_ms').max;
  const measuredSeconds =
    elapsed == null
      ? null
      : Math.max(mode === 'burst' || endedEarly ? 0 : scheduledSeconds, elapsed / 1000, 0.001);
  const rps =
    measuredSeconds == null
      ? (metric('http_reqs{scenario:capacity}').rate ?? 0)
      : count / measuredSeconds;
  return {
    passed: thresholds.length > 0 && thresholds.every((item) => item.ok === true),
    requests: count,
    requestsPerSecond: rps,
    successfulRequestsPerSecond: rps * (1 - (metric('request_errors').rate ?? 0)),
    measuredSeconds,
    throughputClock:
      measuredSeconds == null ? 'k6 test clock (includes setup)' : 'scenario span (excludes setup)',
    rawK6RateIncludingSetup: metric('http_reqs{scenario:capacity}').rate ?? 0,
    p50Ms: metric('http_req_duration{scenario:capacity}').med ?? 0,
    p95Ms: metric('http_req_duration{scenario:capacity}')['p(95)'] ?? 0,
    p99Ms: metric('http_req_duration{scenario:capacity}')['p(99)'] ?? 0,
    errorRate: metric('request_errors').rate ?? 0,
    rateLimited: metric('rate_limited').count ?? 0,
    serverErrors: metric('server_errors').count ?? 0,
    authErrors: metric('auth_errors').count ?? 0,
    droppedIterations: metric('dropped_iterations').count ?? 0,
    checksRate: metric('checks').rate ?? 0,
  };
}

export function validPayload(path, body, allowEmpty = false) {
  if (body?.success !== true || body.data == null) return false;
  const data = body.data;
  if (path.startsWith('/reports/financial'))
    return (
      data.currency === 'NGN' &&
      Number.isFinite(data.grandTotal) &&
      (allowEmpty ? data.transactionCount >= 0 : data.transactionCount > 0)
    );
  const rows = Array.isArray(data) ? data : (data.data ?? data.items);
  return Array.isArray(rows) && (allowEmpty || rows.length > 0);
}
