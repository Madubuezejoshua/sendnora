import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PutObjectParams, StorageProviderAdapter } from './provider.interface.js';

/**
 * Backblaze B2 via its S3-compatible API. B2 buckets are private by
 * default in this setup — every download goes through a short-lived
 * signed URL rather than a public bucket, so a leaked object key alone
 * isn't enough to read the file.
 */
export class B2StorageProvider implements StorageProviderAdapter {
  private readonly client: S3Client;

  constructor(
    endpoint: string,
    region: string,
    private readonly bucket: string,
    keyId: string,
    applicationKey: string,
  ) {
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
    });
  }

  async putObject(params: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
