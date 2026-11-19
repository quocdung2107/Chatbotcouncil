// Chay electron sau khi xoa ELECTRON_RUN_AS_NODE (VS Code/Claude Code dat bien nay,
// lam electron chay nhu node thuong -> "Cannot read properties of undefined (reading 'handle')").
const { spawn } = require('child_process');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
