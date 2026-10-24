/** Peak client requests outstanding, from token-free k6 start/finish events. */
export function summarizeTrace(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const point = JSON.parse(line);
    if (
      point.type !== 'Point' ||
      !['capacity_request_started', 'capacity_request_finished'].includes(point.metric)
    )
      continue;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
      point.data.time,
    );
    if (!match) throw new Error('Unknown k6 trace timestamp');
    const timestamp =
      BigInt(Date.parse(match[1] + match[3])) * 1000000n +
      BigInt((match[2] || '').padEnd(9, '0').slice(0, 9));
    events.push({ timestamp, delta: point.metric === 'capacity_request_started' ? 1 : -1 });
  }
  events.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : b.delta - a.delta,
  );
  let active = 0,
    peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
  }
  return {
    peakClientRequestsInFlight: peak,
    unclosedRequestsAtEnd: active,
    startedRequests: events.filter((event) => event.delta === 1).length,
  };
}
