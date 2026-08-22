import { spawn } from 'node:child_process';
import path from 'node:path';

const forwarded = process.argv.slice(2);
const nextArgs = ['dev', 'apps/web'];

for (let index = 0; index < forwarded.length; index += 1) {
  const value = forwarded[index];
  if (value === '--strictPort') continue;
  if (value === '--host') {
    nextArgs.push('--hostname');
    if (forwarded[index + 1]) {
      nextArgs.push(forwarded[index + 1]);
      index += 1;
    }
    continue;
  }
  nextArgs.push(value);
}

const nextBinary = path.resolve('apps/web/node_modules/.bin/next');
const child = spawn(nextBinary, nextArgs, { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 1));
