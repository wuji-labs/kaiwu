#!/usr/bin/env node
/**
 * One-command setup for development environment
 * Creates directories, shows next steps
 *
 * Run: npm run setup:dev
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STABLE_DIR = path.join(os.homedir(), '.kaiwu');
const DEV_DIR = path.join(os.homedir(), '.kaiwu-dev');

console.log('🔧 Setting up Kaiwu CLI development environment...\n');

// Create directories
[STABLE_DIR, DEV_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  } else {
    console.log(`ℹ️  Already exists: ${dir}`);
  }
});

// Create .envrc for direnv users (optional)
const envrcContent = `# Kaiwu CLI environment (for direnv users)
# Automatically sets KAIWU_HOME_DIR based on directory
#
# To use: cd to kaiwu-cli-dev directory, run: direnv allow
export KAIWU_HOME_DIR="$HOME/.kaiwu-dev"
export KAIWU_VARIANT="dev"
`;

const envrcPath = path.join(__dirname, '..', '.envrc.example');
if (!fs.existsSync(envrcPath)) {
  fs.writeFileSync(envrcPath, envrcContent);
  console.log(`✅ Created: .envrc.example (optional direnv configuration)`);
} else {
  console.log(`ℹ️  Already exists: .envrc.example`);
}

console.log('\n✨ Setup complete!\n');
console.log('📋 Next steps:\n');
console.log('1. Authenticate with stable version:');
console.log('   npm run stable auth login\n');
console.log('2. Authenticate with dev version (can use same or different account):');
console.log('   npm run dev auth login\n');
console.log('3. Start daemons:');
console.log('   npm run stable:daemon:start  # Stable version');
console.log('   npm run dev:daemon:start     # Dev version\n');
console.log('4. Check status:');
console.log('   npm run stable:daemon:status');
console.log('   npm run dev:daemon:status\n');
console.log('💡 All commands are in package.json scripts for easy discovery!');
