import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class UpdatePrefsDto {
  @ApiPropertyOptional({ example: 7, description: 'Days before renewal for first alert' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  daysFirst?: number;

  @ApiPropertyOptional({ example: 3, description: 'Days before renewal for second alert' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  daysSecond?: number;
}
