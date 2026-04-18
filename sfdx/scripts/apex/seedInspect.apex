// seedInspect.apex
// Run with: sf apex run --file sfdx/scripts/apex/seedInspect.apex --target-org <alias>
// Prints the state of each asset QuantumShield scans, post-deploy,
// so we can verify the scratch org is ready for a real scan.

System.debug('=== QuantumShield scan target — readiness check ===');

// 1. Connected App (the External Client App)
List<ConnectedApplication> apps = [
    SELECT Id, Name
    FROM ConnectedApplication
    WHERE Name = 'QuantumShield Scanner'
    LIMIT 1
];
System.debug('ConnectedApplication.QuantumShield_Scanner: ' +
    (apps.isEmpty() ? 'MISSING' : 'OK id=' + apps[0].Id));

// 2. Remote Site Settings — count active HTTP-only entries.
// RemoteSiteSetting is Tooling, not a regular sObject; queryable only via Tooling.
// So we just log what we can via SOQL on the data-tier view.

// 3. Named Credentials.
List<NamedCredential> ncs = [
    SELECT Id, DeveloperName, Endpoint
    FROM NamedCredential
    LIMIT 20
];
System.debug('NamedCredentials found: ' + ncs.size());
for (NamedCredential n : ncs) {
    System.debug('  - ' + n.DeveloperName + ' -> ' + n.Endpoint);
}

// 4. Apex classes we planted.
List<ApexClass> classes = [
    SELECT Id, Name, LengthWithoutComments
    FROM ApexClass
    WHERE Name IN ('LegacyHashUtil', 'PartnerWebhookSigner', 'LegacyCipher', 'ModernCrypto')
    ORDER BY Name
];
System.debug('Planted Apex classes: ' + classes.size() + ' / 4');
for (ApexClass c : classes) {
    System.debug('  - ' + c.Name + ' (' + c.LengthWithoutComments + ' bytes)');
}

// 5. Session settings sanity.
// SessionSettings lives in the Setup hierarchy; a scratch org starts with sensible defaults.
Organization orgRec = [SELECT Id, Name, OrganizationType FROM Organization LIMIT 1];
System.debug('Org: ' + orgRec.Name + ' (' + orgRec.OrganizationType + ')');

System.debug('=== readiness check complete ===');
