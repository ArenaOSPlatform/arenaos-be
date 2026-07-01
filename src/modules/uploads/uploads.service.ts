import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isProduction } from '../../config/environment';

export type ImageUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type AllowedImage = {
  extension: '.gif' | '.jpg' | '.png' | '.webp';
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly publicBaseUrl =
    process.env.API_PUBLIC_URL ?? 'http://localhost:3000';
  private readonly cloudinaryFolder =
    this.getCleanEnv('CLOUDINARY_UPLOAD_FOLDER') || 'arenaos';

  private getCleanEnv(name: string) {
    return process.env[name]?.trim().replace(/^["'<]+|[>"']+$/g, '');
  }

  private detectImage(file: ImageUploadFile): AllowedImage | null {
    const bytes = file.buffer;

    if (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return { extension: '.png', mimeType: 'image/png' };
    }

    if (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    ) {
      return { extension: '.jpg', mimeType: 'image/jpeg' };
    }

    if (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { extension: '.webp', mimeType: 'image/webp' };
    }

    const gifHeader = bytes.subarray(0, 6).toString('ascii');

    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return { extension: '.gif', mimeType: 'image/gif' };
    }

    return null;
  }

  private isCloudinaryConfigured() {
    if (this.getCleanEnv('CLOUDINARY_URL')) {
      return true;
    }

    return Boolean(
      this.getCleanEnv('CLOUDINARY_CLOUD_NAME') &&
      this.getCleanEnv('CLOUDINARY_API_KEY') &&
      this.getCleanEnv('CLOUDINARY_API_SECRET'),
    );
  }

  private configureCloudinary() {
    if (this.getCleanEnv('CLOUDINARY_URL')) {
      cloudinary.config({ secure: true });
      return;
    }

    const cloudName = this.getCleanEnv('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.getCleanEnv('CLOUDINARY_API_KEY');
    const apiSecret = this.getCleanEnv('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  private getUploadErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Cloudinary upload failed';
  }

  private uploadToCloudinary(file: ImageUploadFile) {
    this.configureCloudinary();

    return new Promise<{
      filename: string;
      path: string;
      url: string;
      publicId: string;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: this.cloudinaryFolder,
          public_id: randomUUID(),
          resource_type: 'image',
          overwrite: false,
          tags: ['arenaos'],
        },
        (error, result) => {
          if (error) {
            const rejectionError: Error =
              error instanceof Error
                ? error
                : new Error(this.getUploadErrorMessage(error));

            reject(rejectionError);
            return;
          }

          if (!result) {
            reject(new Error('Cloudinary upload did not return a result'));
            return;
          }

          resolve({
            filename: result.format
              ? `${result.public_id}.${result.format}`
              : result.public_id,
            path: result.public_id,
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async saveImage(file?: ImageUploadFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    const detectedImage = this.detectImage(file);

    if (!detectedImage) {
      throw new BadRequestException(
        'Only valid PNG, JPEG, WebP, or GIF images are allowed',
      );
    }

    file.mimetype = detectedImage.mimeType;

    if (this.isCloudinaryConfigured()) {
      try {
        const uploaded = await this.uploadToCloudinary(file);

        return {
          message: 'Upload file successfully',
          data: {
            filename: uploaded.filename,
            path: uploaded.path,
            url: uploaded.url,
            provider: 'CLOUDINARY',
            publicId: uploaded.publicId,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (
          process.env.UPLOAD_REQUIRE_CLOUDINARY === 'true' ||
          isProduction()
        ) {
          throw new BadRequestException('Cloudinary upload failed');
        }

        this.logger.warn(
          `Cloudinary upload failed, falling back to local storage: ${message}`,
        );
      }
    }

    if (isProduction()) {
      throw new BadRequestException('Cloudinary upload is required');
    }

    await mkdir(this.uploadDir, { recursive: true });

    const filename = `${randomUUID()}${detectedImage.extension}`;
    const relativePath = `/uploads/${filename}`;

    await writeFile(join(this.uploadDir, filename), file.buffer);

    return {
      message: 'Upload file successfully',
      data: {
        filename,
        path: relativePath,
        url: `${this.publicBaseUrl}${relativePath}`,
        provider: 'LOCAL',
      },
    };
  }
}
