import { ApiProperty } from '@nestjs/swagger';
import { IsString, Equals } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ example: 'DELETE', description: 'Must be the string "DELETE" to confirm' })
  @IsString()
  @Equals('DELETE', { message: 'Must confirm with "DELETE"' })
  confirmation: string;
}
