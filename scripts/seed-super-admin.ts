/** Compatibility entry point; all provisioning uses the protected Bash console. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(
  'bash',
  [resolve(__dirname, 'console.sh'), '--action', 'admin-super', ...process.argv.slice(2)],
  { stdio: 'inherit', shell: false },
);
if (result.error)
  console.error('Could not start the operations console. Check Bash and Node installation.');
process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
