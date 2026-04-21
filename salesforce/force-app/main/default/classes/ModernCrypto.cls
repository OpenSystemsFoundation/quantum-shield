/**
 * Compliant crypto helpers. QuantumShield should NOT flag this class
 * — it's the negative control.
 */
public with sharing class ModernCrypto {

    public static String sha256(String input) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(input))
        );
    }

    public static String sha3(String input) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA3-256', Blob.valueOf(input))
        );
    }

    public static Blob encryptAes256(Blob key, Blob data) {
        return Crypto.encryptWithManagedIV('AES256', key, data);
    }
}