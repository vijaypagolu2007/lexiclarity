// Local preview launcher for the React/Vite application.
const { spawn } = require('child_process');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const port = option('--port', '3000');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'dev'], {
  env: { ...process.env, PORT: port },
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
