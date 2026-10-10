/** Serverless HTTP instances enqueue work; a persistent worker processes it. */
export function workersEnabled() {
  if (process.env.ENABLE_QUEUE_WORKERS !== undefined)
    return process.env.ENABLE_QUEUE_WORKERS === 'true';
  return !(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.FUNCTION_TARGET
  );
}
