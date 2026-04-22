/**
 * Dutch regional vault — wraps AES encryption with a HARDCODED 32-byte key.
 * This exercises the scanner's 256-bit hardcoded-key detection path
 * alongside an AES-256 algorithm that on its own is compliant.
 * R-APEX-CRYPTO (critical, hardcoded key) must still fire.
 */
public with sharing class DutchVaultCipher {

    // HARDCODED 256-bit key — intentionally committed so QuantumShield detects it.
    private static final Blob DUTCH_VAULT_KEY =
        Blob.valueOf('RijksVaultKeyMaterial_32_BYTES!!');

    public static String encrypt(String plaintext) {
        Blob data = Blob.valueOf(plaintext);
        Blob encrypted = Crypto.encryptWithManagedIV('AES256', DUTCH_VAULT_KEY, data);
        return EncodingUtil.base64Encode(encrypted);
    }

    public static String decrypt(String ciphertextB64) {
        Blob encrypted = EncodingUtil.base64Decode(ciphertextB64);
        Blob decrypted = Crypto.decryptWithManagedIV('AES256', DUTCH_VAULT_KEY, encrypted);
        return decrypted.toString();
    }
}
