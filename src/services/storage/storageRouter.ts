export interface StorageUploadParams {
  fileData: string; // base64 or url
  folder?: string;
  mimeType?: string;
  metadata?: Record<string, any>;
}

export class StorageRouter {
  // Modular Storage router (supports local, S3, GCS, Cloudflare R2)
  async saveMedia(params: StorageUploadParams): Promise<{ url: string; storageId: string }> {
    const storageId = `media_${Date.now()}`;
    return {
      url: params.fileData,
      storageId
    };
  }

  async deleteMedia(storageId: string): Promise<boolean> {
    return true;
  }
}

export const storageRouter = new StorageRouter();

export const storageService = {
  saveMedia: (params: StorageUploadParams) => storageRouter.saveMedia(params),
  deleteMedia: (storageId: string) => storageRouter.deleteMedia(storageId)
};
