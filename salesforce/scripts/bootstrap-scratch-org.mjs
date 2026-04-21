import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const projectRoot = process.cwd();
const scratchDefPath = path.join('config', 'project-scratch-def.json');
const oauthSettingsPath = path.join(
  projectRoot,
  'force-app',
  'main',
  'default',
  'extlClntAppGlobalOauthSets',
  'QuantumShield_Scanner_glbloauth.ecaGlblOauth-meta.xml',
);

function parseArgs(argv) {
  const options = {
    alias: 'qs-seed',
    durationDays: '7',
    devhub: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--alias' && argv[index + 1]) {
      options.alias = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--duration-days' && argv[index + 1]) {
      options.durationDays = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--devhub' && argv[index + 1]) {
      options.devhub = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function quote(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function runSf(args, { silent = false } = {}) {
  const command = ['sf', ...args].map(quote).join(' ');
  const { stdout, stderr } = await execAsync(command, {
    cwd: projectRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!silent) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }
  return stdout;
}

async function resolveDefaultDevHub() {
  const raw = await runSf(['config', 'get', 'target-dev-hub', '--json'], { silent: true });
  const payload = JSON.parse(raw);
  const value = payload.result?.find?.((entry) => entry.name === 'target-dev-hub')?.value;
  return value ?? '';
}

async function readConsumerKey() {
  const source = await readFile(oauthSettingsPath, 'utf8');
  const match = source.match(/<consumerKey>([^<]+)<\/consumerKey>/);
  return match?.[1] ?? '';
}

const options = parseArgs(process.argv.slice(2));
if (!options.devhub) {
  options.devhub = await resolveDefaultDevHub();
}
if (!options.devhub) {
  throw new Error('No Dev Hub alias configured. Pass --devhub <alias> or set sf config target-dev-hub.');
}

await runSf([
  'org',
  'create',
  'scratch',
  '--target-dev-hub',
  options.devhub,
  '--definition-file',
  scratchDefPath,
  '--alias',
  options.alias,
  '--duration-days',
  options.durationDays,
  '--set-default',
  '--wait',
  '20',
]);

await runSf(['project', 'deploy', 'start', '--target-org', options.alias, '--wait', '20']);

const passwordRaw = await runSf(['org', 'generate', 'password', '--target-org', options.alias, '--json'], {
  silent: true,
});
const passwordPayload = JSON.parse(passwordRaw);

const orgRaw = await runSf(['org', 'display', '--target-org', options.alias, '--verbose', '--json'], {
  silent: true,
});
const orgPayload = JSON.parse(orgRaw);
const consumerKey = await readConsumerKey();

console.log('');
console.log('Scratch org ready for QuantumShield testing.');
console.log(`Alias:        ${options.alias}`);
console.log(`Username:     ${orgPayload.result.username}`);
console.log(`Password:     ${passwordPayload.result.password}`);
console.log(`Instance URL: ${orgPayload.result.instanceUrl}`);
console.log(`Consumer Key: ${consumerKey}`);
console.log('');
console.log('Use these app env values if you want to point the web app at this org:');
console.log(`PUBLIC_SF_CLIENT_ID=${consumerKey}`);
console.log(`PUBLIC_SF_API_VERSION=${orgPayload.result.apiVersion}`);
console.log(`PUBLIC_SF_SCRATCH_INSTANCE=${orgPayload.result.instanceUrl}`);
console.log('PUBLIC_DEV_MOCK=0');