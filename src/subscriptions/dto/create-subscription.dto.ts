import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsOptional,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'Netflix' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'streaming', default: 'other' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 15.99, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiProperty({ example: 15, description: 'Day of month for billing (1–31)' })
  @IsInt()
  @Min(1)
  @Max(31)
  billingDay: number;

  @ApiProperty({
    example: 'monthly',
    description: '"monthly", "yearly", or a month abbreviation like "Jan"',
  })
  @IsString()
  @IsNotEmpty()
  billingMonth: string;

  @ApiPropertyOptional({ example: '2024-01-15', description: 'ISO date string' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'paused', 'cancelled'] })
  @IsOptional()
  @IsIn(['active', 'paused', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ example: 'Family plan' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'USD', enum: ['USD', 'EUR'] })
  @IsOptional()
  @IsIn(['USD', 'EUR'])
  currency?: string;
}
