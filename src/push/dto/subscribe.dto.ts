import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SubscribeDto {
  @ApiProperty({ description: 'Service worker push endpoint URL' })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}
