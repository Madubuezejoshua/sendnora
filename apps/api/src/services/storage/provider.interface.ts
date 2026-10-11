export interface PutObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProviderAdapter {
  putObject(params: PutObjectParams): Promise<void>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
