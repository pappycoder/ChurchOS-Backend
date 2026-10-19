/** Normalize wrapped PostgreSQL trigger failures without exposing SQL or private row data. */
export function subscriptionError(exception: unknown) {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(exception, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString();
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value instanceof Error
      ? { ...value, message: value.message, cause: (value as Error & { cause?: unknown }).cause }
      : value;
  });
  const match =
    /PLAN_(LIMIT_REACHED|FEATURE_REQUIRED):(members|staff|locations|giving|events|groups|forms|reports|tickets|pastoral|assets|analytics|email|sms|whatsapp|calls)/.exec(
      serialized ?? '',
    );
  if (!match) return undefined;
  return {
    status: 403,
    code: `PLAN_${match[1]}`,
    message:
      match[1] === 'LIMIT_REACHED'
        ? `Your church has reached its ${match[2]} allowance. Contact your church administrator.`
        : 'This feature requires a different church subscription. Contact your church administrator.',
    details: { resource: match[2] },
  };
}
