import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);
const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'src', 'lib', 'scan', 'fixtures', 'liveOrgSnapshot.generated.ts');

// Keep in exact sync with the SOQL strings in src/lib/scan/scanners.ts —
// SnapshotSfClient resolves fixtures by exact query text.
const QUERY_PLAN = [
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, DeveloperName, MasterLabel, KeySize, ExpirationDate FROM Certificate',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, Name, DeveloperName, ContactEmail, RefreshTokenValidityPeriod FROM ConnectedApplication',
  },
  // ExternalClientApplication: REST first, Tooling as the fallback.
  {
    kind: 'query',
    soql: 'SELECT Id, DeveloperName, MasterLabel FROM ExternalClientApplication',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, DeveloperName, MasterLabel FROM ExternalClientApplication',
  },
  {
    kind: 'query',
    soql: 'SELECT Id, DeveloperName, MasterLabel, Endpoint, PrincipalType FROM NamedCredential',
  },
  // ExternalCredential: Tooling first, REST as the fallback.
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
  },
  {
    kind: 'query',
    soql: 'SELECT Id, DeveloperName, MasterLabel, AuthenticationProtocol FROM ExternalCredential',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, FullName, EndpointUrl, IsActive FROM RemoteSiteSetting',
  },
  {
    kind: 'query',
    soql: 'SELECT Id, DeveloperName, MasterLabel, RequestSignatureMethod FROM SamlSsoConfig',
  },
  {
    kind: 'query',
    soql: 'SELECT Id, DeveloperName, ProviderType, FriendlyName FROM AuthProvider',
  },
  {
    kind: 'query',
    soql: 'SELECT Id, Type, Status, Version, Source, RemoteKeyIdentifier, CreatedDate FROM TenantSecret',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, Name, Body, ApiVersion, NamespacePrefix FROM ApexClass WHERE NamespacePrefix = null',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, Name, Body, ApiVersion, NamespacePrefix FROM ApexTrigger WHERE NamespacePrefix = null',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, SessionTimeout FROM SessionSettings',
  },
  {
    kind: 'toolingQuery',
    soql: 'SELECT Id, SubscriberPackageId, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion, SubscriberPackageVersion.Name FROM InstalledSubscriberPackage',
  },
];

function parseArgs(argv) {
  const args = { targetOrg: 'quantum-shield' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--target-org' && argv[index + 1]) {
      args.targetOrg = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function getOrgSession(targetOrg) {
  const { stdout } = await execAsync(
    `sf org display --target-org ${targetOrg} --verbose --json`,
    { cwd: rootDir, maxBuffer: 10 * 1024 * 1024 },
  );
  const payload = JSON.parse(stdout);
  if (payload.status !== 0 || !payload.result) {
    throw new Error(`Unable to read org session for ${targetOrg}`);
  }
  const session = payload.result;
  // Modern sf CLI redacts the token in `org display`; fetch it explicitly.
  if (!session.accessToken || session.accessToken.startsWith('[REDACTED')) {
    const { stdout: tokenOut } = await execAsync(
      `sf org auth show-access-token --target-org ${targetOrg} --json`,
      { cwd: rootDir, maxBuffer: 1024 * 1024 },
    );
    const tokenPayload = JSON.parse(tokenOut);
    session.accessToken = tokenPayload?.result?.accessToken;
  }
  if (!session.accessToken || session.accessToken.startsWith('[REDACTED')) {
    throw new Error(`Unable to obtain an access token for ${targetOrg}`);
  }
  return session;
}

async function runRestQuery(session, kind, soql) {
  const base = `${session.instanceUrl.replace(/\/$/, '')}/services/data/v${session.apiVersion}`;
  const route = kind === 'toolingQuery' ? '/tooling/query?q=' : '/query?q=';
  let nextUrl = `${base}${route}${encodeURIComponent(soql)}`;
  const aggregated = [];
  let totalSize = 0;

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          kind,
          soql,
          outcome: 'error',
          error: `Salesforce API ${response.status}: ${text.slice(0, 400)}`,
        };
      }

      const payload = await response.json();
      if (kind === 'query') {
        totalSize = payload.totalSize ?? totalSize;
        aggregated.push(...(payload.records ?? []));
        nextUrl = payload.done ? undefined : `${session.instanceUrl}${payload.nextRecordsUrl}`;
      } else {
        return {
          kind,
          soql,
          outcome: 'success',
          result: payload,
        };
      }
    }

    return {
      kind,
      soql,
      outcome: 'success',
      result: {
        totalSize,
        done: true,
        records: aggregated,
      },
    };
  } catch (error) {
    return {
      kind,
      soql,
      outcome: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const { targetOrg } = parseArgs(process.argv.slice(2));
const session = await getOrgSession(targetOrg);

const responses = [];
for (const plan of QUERY_PLAN) {
  responses.push(await runRestQuery(session, plan.kind, plan.soql));
}

// The data-sensitivity pass builds its queries from what the org contains
// (which objects exist), so instead of a fixed plan it is run for real
// against a recording client. Requires running this script with tsx (the
// npm script does), which can import the TypeScript source.
const { buildDataProfile } = await import('../src/lib/priority/profile.ts');
const record = async (kind, soql) => {
  const response = await runRestQuery(session, kind, soql);
  if (!responses.some((r) => r.kind === kind && r.soql === soql)) responses.push(response);
  if (response.outcome === 'error') throw new Error(response.error);
  return response.result;
};
await buildDataProfile({
  query: (soql) => record('query', soql),
  toolingQuery: (soql) => record('toolingQuery', soql),
  sobject: () => Promise.reject(new Error('not recorded')),
});

const snapshot = {
  capturedAt: new Date().toISOString(),
  source: {
    targetOrg,
    orgId: session.id,
    orgName: session.orgName ?? targetOrg,
    instanceUrl: session.instanceUrl,
    apiVersion: session.apiVersion,
  },
  responses,
};

const generated = `/* auto-generated by scripts/capture-scan-fixtures.mjs; do not edit by hand. */\nimport type { ScanSnapshot } from './types.js';\n\nexport const LIVE_ORG_SCAN_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const satisfies ScanSnapshot;\n`;

await writeFile(outputFile, generated);
console.log(`Captured ${responses.length} scan query responses -> ${path.relative(rootDir, outputFile)}`);