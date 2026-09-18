import { S3Client } from '@aws-sdk/client-s3';

let _s3: S3Client | null = null;

export function getS3(): { client: S3Client; bucket: string } {
  const bucket = process.env.S3_BUCKET_NAME || '';

  if (!_s3) {
    _s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT_URL,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });
  }
  return { client: _s3, bucket };
}
