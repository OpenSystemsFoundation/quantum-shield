System.debug('=== QuantumShield scan target — readiness check ===');

List<NamedCredential> ncs = [
    SELECT Id, DeveloperName, MasterLabel, Endpoint
    FROM NamedCredential
    WHERE DeveloperName IN ('Partner_OAuth_API', 'Legacy_Billing_API', 'US_Medicare_Claims_API')
    ORDER BY DeveloperName
];
System.debug('NamedCredentials found: ' + ncs.size());
for (NamedCredential nc : ncs) {
    System.debug('  - ' + nc.DeveloperName + ' -> ' + nc.Endpoint);
}

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

Organization orgRec = [SELECT Id, Name, OrganizationType FROM Organization LIMIT 1];
System.debug('Org: ' + orgRec.Name + ' (' + orgRec.OrganizationType + ')');

System.debug('=== readiness check complete ===');