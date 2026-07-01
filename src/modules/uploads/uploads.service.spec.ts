import { BadRequestException } from '@nestjs/common';
import { UploadsService, type ImageUploadFile } from './uploads.service';

describe('UploadsService', () => {
  const service = new UploadsService();

  it('rejects files whose content does not match an allowed raster image', async () => {
    const file: ImageUploadFile = {
      originalname: 'payload.svg',
      mimetype: 'image/png',
      size: 30,
      buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
    };

    await expect(service.saveImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
