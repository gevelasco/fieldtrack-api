import { NotFoundException } from '@nestjs/common';
import type { FileService } from './file.service';

export type StoredFileMeta = {
  fileName: string | null | undefined;
  contentType: string | null | undefined;
  storageKey: string | null | undefined;
  content: Buffer | null | undefined;
};

export async function resolveStoredFile(
  fileService: FileService,
  meta: StoredFileMeta,
): Promise<{ fileName: string; contentType: string; content: Buffer }> {
  if (meta.storageKey) {
    const obj = await fileService.getObject(meta.storageKey);
    if (!meta.fileName) {
      throw new NotFoundException('No hay archivo.');
    }
    return {
      fileName: meta.fileName,
      contentType: meta.contentType || obj.contentType || 'application/octet-stream',
      content: obj.body,
    };
  }
  if (!meta.fileName || !meta.content?.length) {
    throw new NotFoundException('No hay archivo.');
  }
  return {
    fileName: meta.fileName,
    contentType: meta.contentType || 'application/octet-stream',
    content: meta.content,
  };
}

export function toMulterFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  size: number,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: originalName,
    encoding: '7bit',
    mimetype,
    size,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

export async function uploadToStorage(
  fileService: FileService,
  folder: string,
  file: { content: Buffer; contentType: string; size: number },
  originalName: string,
): Promise<{ storageKey: string; contentType: string; sizeBytes: string }> {
  const uploaded = await fileService.upload(
    folder,
    toMulterFile(file.content, originalName, file.contentType, file.size),
  );
  return {
    storageKey: uploaded.url,
    contentType: file.contentType,
    sizeBytes: uploaded.size,
  };
}

export async function removeStorageKey(
  fileService: FileService,
  storageKey: string | null | undefined,
): Promise<void> {
  if (storageKey) {
    await fileService.remove(storageKey);
  }
}
