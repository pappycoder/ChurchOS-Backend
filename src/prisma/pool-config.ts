/** Keep serverless budgets explicit: limits multiply across function instances. */
export function databasePoolSettings(environment: NodeJS.ProcessEnv) {
  const serverless = Boolean(
    environment.VERCEL ||
    environment.AWS_LAMBDA_FUNCTION_NAME ||
    environment.LAMBDA_TASK_ROOT ||
    environment.FUNCTION_TARGET,
  );
  const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
    const raw = environment[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (raw === '' || !Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
    return value;
  };
  return {
    serverless,
    max: serverless
      ? integer('DB_SERVERLESS_POOL_MAX', 1, 1, 10)
      : integer('DB_POOL_MAX', 10, 1, 100),
    idleTimeoutMillis: integer('DB_IDLE_TIMEOUT_MS', serverless ? 1000 : 10000, 1000, 2147483647),
    connectionTimeoutMillis: integer('DB_CONNECT_TIMEOUT_MS', 15000, 0, 2147483647),
  };
}
