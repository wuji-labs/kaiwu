import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256Base64Url(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return hash.digest('base64url');
}

export function signRsaSha256(content: string, privateKeyPem: string, keyid: string = 'main'): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const signatureBase64 = signer.sign(privateKeyPem, 'base64');
  return `sig="${signatureBase64}", keyid="${keyid}"`;
}

export function verifyRsaSha256(content: string, signatureBase64: string, certPem: string): boolean {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content, 'utf8');
    verifier.end();
    return verifier.verify(certPem, signatureBase64, 'base64');
  } catch {
    return false;
  }
}

export function parseSignatureHeader(sigHeader: string): { sig: string; keyid: string } | null {
  const sigMatch = sigHeader.match(/sig="([^"]+)"/);
  const keyidMatch = sigHeader.match(/keyid="([^"]+)"/);
  if (!sigMatch) return null;
  return {
    sig: sigMatch[1],
    keyid: keyidMatch ? keyidMatch[1] : 'main',
  };
}

export function loadPrivateKey(keyPath: string): string | null {
  if (!keyPath) return null;
  try {
    if (!fs.existsSync(keyPath)) return null;
    return fs.readFileSync(keyPath, 'utf8');
  } catch {
    return null;
  }
}
