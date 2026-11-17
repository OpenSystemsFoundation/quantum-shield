/**
 * Hits multiple quantum-vulnerable primitives in one class so the scanner
 * must report distinct findings at distinct line numbers:
 *   - RSA-SHA512 signature (high; signatures are not HNDL-exposed)
 *   - SHA-1 digest             (high, deprecated)
 *   - MD5 digest               (critical)
 */
public with sharing class EuBankingSigner {

    private static final String CERT_NAME = 'eu_banking_signer_2026';

    public static String signIsoPayload(String payload) {
        Blob payloadBlob = Blob.valueOf(payload);
        Blob signature = Crypto.signWithCertificate('RSA-SHA512', payloadBlob, CERT_NAME);
        return EncodingUtil.base64Encode(signature);
    }

    public static String weakHashSha1(String input) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-1', Blob.valueOf(input))
        );
    }

    public static String weakHashMd5(String input) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('MD5', Blob.valueOf(input))
        );
    }
}
