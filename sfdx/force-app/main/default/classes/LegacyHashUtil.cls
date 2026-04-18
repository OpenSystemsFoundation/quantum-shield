/**
 * Legacy hash utility. Deliberately uses MD5 and SHA-1 to
 * exercise the QuantumShield apex-crypto weak-hash rule.
 * DO NOT use these methods for anything security-relevant.
 */
public with sharing class LegacyHashUtil {

    /** MD5 digest — flagged by R-APEX-CRYPTO (critical). */
    public static String md5(String input) {
        Blob raw = Blob.valueOf(input);
        Blob digest = Crypto.generateDigest('MD5', raw);
        return EncodingUtil.convertToHex(digest);
    }

    /** SHA-1 digest — flagged by R-APEX-CRYPTO (critical). */
    public static String sha1(String input) {
        Blob raw = Blob.valueOf(input);
        Blob digest = Crypto.generateDigest('SHA-1', raw);
        return EncodingUtil.convertToHex(digest);
    }

    /** SHA-256 digest — compliant, scanner should NOT flag. */
    public static String sha256(String input) {
        Blob raw = Blob.valueOf(input);
        Blob digest = Crypto.generateDigest('SHA-256', raw);
        return EncodingUtil.convertToHex(digest);
    }
}
