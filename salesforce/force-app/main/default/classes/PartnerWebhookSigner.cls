/**
 * Signs outbound webhook payloads with RSA-SHA256.
 * Quantum-vulnerable — flagged by R-APEX-CRYPTO (high, HNDL).
 */
public with sharing class PartnerWebhookSigner {

    private static final String CERT_NAME = 'partner_signing_2026';

    public static String signPayload(String payload) {
        Blob payloadBlob = Blob.valueOf(payload);
        Blob signature = Crypto.signWithCertificate('RSA-SHA256', payloadBlob, CERT_NAME);
        return EncodingUtil.base64Encode(signature);
    }

    /** ECDSA signing — also flagged by R-APEX-CRYPTO (high). */
    public static String signPayloadEcdsa(String payload) {
        Blob payloadBlob = Blob.valueOf(payload);
        Blob signature = Crypto.signWithCertificate('ECDSA-SHA256', payloadBlob, CERT_NAME);
        return EncodingUtil.base64Encode(signature);
    }
}