/**
 * Legacy AES cipher with a HARDCODED key baked into source.
 * Flagged by R-APEX-CRYPTO for hardcoded key material and
 * separately by QuantumShield's Apex pattern matcher.
 */
public with sharing class LegacyCipher {

    // HARDCODED 128-bit key — intentionally committed so QuantumShield detects it.
    private static final Blob HARDCODED_KEY =
        Blob.valueOf('ThisIsA16ByteKey');

    public static String encrypt(String plaintext) {
        Blob data = Blob.valueOf(plaintext);
        Blob encrypted = Crypto.encryptWithManagedIV('AES128', HARDCODED_KEY, data);
        return EncodingUtil.base64Encode(encrypted);
    }

    public static String decrypt(String ciphertextB64) {
        Blob encrypted = EncodingUtil.base64Decode(ciphertextB64);
        Blob decrypted = Crypto.decryptWithManagedIV('AES128', HARDCODED_KEY, encrypted);
        return decrypted.toString();
    }
}