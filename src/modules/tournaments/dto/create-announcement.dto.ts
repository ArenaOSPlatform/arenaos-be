import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const announcementTypes = ['INFO', 'WARNING', 'URGENT'] as const;

export type AnnouncementType = (typeof announcementTypes)[number];

export class CreateAnnouncementDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(announcementTypes)
  type!: AnnouncementType;
}
