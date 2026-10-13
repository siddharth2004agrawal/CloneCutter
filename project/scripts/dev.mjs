import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const viteEntry = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const windows = process.platform === 'win32';
const virtualEnvPython = join(projectRoot, '.venv', windows ? 'Scripts' : 'bin', windows ? 'python.exe' : 'python');
const pythonCommand = process.env.PYTHON || (existsSync(virtualEnvPython) ? virtualEnvPython : windows ? 'python' : 'python3');

if (!existsSync(viteEntry)) {
  console.error('CloneCutter dependencies are missing. Run `npm install` in the project folder first.');
  process.exit(1);
}

let stopping = false;
const children = [];

function forwardOutput(stream, label, destination) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = `${pending}${chunk}`.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) destination.write(`[${label}] ${line}\n`);
  });
  stream.on('end', () => {
    if (pending) destination.write(`[${label}] ${pending}\n`);
  });
}

function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  forwardOutput(child.stdout, label, process.stdout);
  forwardOutput(child.stderr, label, process.stderr);
  child.on('error', (error) => {
    console.error(`[${label}] Could not start: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    const status = code ?? (signal ? 1 : 0);
    if (status !== 0) console.error(`[${label}] Stopped unexpectedly${signal ? ` (${signal})` : ` with code ${status}`}.`);
    stop(status);
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log('Starting CloneCutter UI and local file server. Press Ctrl+C to stop both.');
start('server', pythonCommand, ['-u', join(projectRoot, 'server.py')]);
start('web', process.execPath, [viteEntry, '--host', '127.0.0.1']);
