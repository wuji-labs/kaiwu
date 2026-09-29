import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The certificate embedded in the app (apps/ui/certs) must be a code-signing leaf certificate.
// expo-updates silently rejects every signed update otherwise; that is exactly what happened with the
// first certificate (a CA cert without the codeSigning EKU): the app never applied any OTA update.
const certPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ui/certs/kaiwu-ota-certificate.pem');

describe('embedded OTA code signing certificate', () => {
  const cert = new crypto.X509Certificate(fs.readFileSync(certPath));

  it('carries the codeSigning extended key usage', () => {
    assert.ok(cert.keyUsage?.includes('1.3.6.1.5.5.7.3.3'), `EKU was ${JSON.stringify(cert.keyUsage)}`);
  });

  it('is not a CA certificate', () => {
    assert.strictEqual(cert.ca, false);
  });

  it('is valid for at least another year', () => {
    assert.ok(new Date(cert.validTo).getTime() - Date.now() > 365 * 24 * 3600 * 1000, `validTo ${cert.validTo}`);
  });
});
