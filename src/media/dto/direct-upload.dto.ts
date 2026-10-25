import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { UploadMediaDto } from './upload-media.dto';

export class DirectUploadDto extends UploadMediaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size!: number;
}

export class CompleteDirectUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  ticket!: string;
}
