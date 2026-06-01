import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ImageUploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class UploadsService {
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly publicBaseUrl =
    process.env.API_PUBLIC_URL ?? 'http://localhost:3000';

  async saveImage(file?: ImageUploadFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    await mkdir(this.uploadDir, { recursive: true });

    const extension = extname(file.originalname).toLowerCase() || '.jpg';
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `/uploads/${filename}`;

    await writeFile(join(this.uploadDir, filename), file.buffer);

    return {
      message: 'Upload file successfully',
      data: {
        filename,
        path: relativePath,
        url: `${this.publicBaseUrl}${relativePath}`,
      },
    };
  }
}
