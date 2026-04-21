import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const projectRoot = process.cwd();
const manifestPath = path.join('manifest', 'quantum-shield-app-setup.xml');

function parseArgs(argv) {
  const options = {
    targetOrg: 'quantum-shield',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target-org' && argv[index + 1]) {
      options.targetOrg = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

async function run(command) {
  const { stdout, stderr } = await execAsync(command, {
    cwd: projectRoot,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function stripXmlElement(relativePath, tagName) {
  const filePath = path.join(projectRoot, relativePath);
  const original = await readFile(filePath, 'utf8');
  const pattern = new RegExp(`\n\s*<${tagName}>[\s\S]*?<\/${tagName}>`, 'g');
  const updated = original.replace(pattern, '');
  if (updated !== original) {
    await writeFile(filePath, updated);
  }
}

const { targetOrg } = parseArgs(process.argv.slice(2));

await run(
  `sf project retrieve start --target-org ${targetOrg} --manifest ${manifestPath} --ignore-conflicts --wait 20`,
);

await stripXmlElement(
  path.join('force-app', 'main', 'default', 'externalClientApps', 'QuantumShield_Scanner.eca-meta.xml'),
  'orgScopedExternalApp',
);
await stripXmlElement(
  path.join('force-app', 'main', 'default', 'extlClntAppOauthSettings', 'QuantumShield_Scanner_oauth.ecaOauth-meta.xml'),
  'oauthLink',
);

console.log('Sanitized org-bound External Client App linkage fields.');