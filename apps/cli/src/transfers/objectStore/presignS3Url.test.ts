import { describe, expect, it } from 'vitest';

import { presignS3Url } from './presignS3Url';

describe('presignS3Url', () => {
  it('matches the AWS SigV4 query-string presign reference example', () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presignS3Url({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      key: 'test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt'
        + '?X-Amz-Algorithm=AWS4-HMAC-SHA256'
        + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request'
        + '&X-Amz-Date=20130524T000000Z'
        + '&X-Amz-Expires=86400'
        + '&X-Amz-SignedHeaders=host'
        + '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('encodes each key path segment but keeps separators', () => {
    const url = presignS3Url({
      method: 'PUT',
      host: 'bucket.cos.ap-shanghai.myqcloud.com',
      key: 'transfers/a b/0',
      region: 'ap-shanghai',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      expiresSeconds: 60,
      now: new Date('2026-10-14T00:00:00Z'),
    });
    expect(url.startsWith('https://bucket.cos.ap-shanghai.myqcloud.com/transfers/a%20b/0?')).toBe(true);
  });
});
