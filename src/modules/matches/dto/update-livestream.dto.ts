import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class UpdateLivestreamDto {
  @IsNotEmpty()
  @IsString()
  @IsUrl({ require_protocol: true })
  livestreamUrl!: string;
}
