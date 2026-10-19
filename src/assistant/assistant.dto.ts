import { IsArray, IsOptional, IsString, MaxLength, ArrayMaxSize, Matches } from 'class-validator';
export class AssistantQuestionDto {
  @IsString() @MaxLength(1200) question!: string;
  @IsOptional() @IsString() @MaxLength(150) @Matches(/^\/[a-zA-Z0-9/[\]_-]*$/) page?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(600, { each: true })
  history?: string[];
}
