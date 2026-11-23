import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '12345678901', description: 'CPF (11 dígitos) ou CNPJ (14 dígitos)' })
  @IsString()
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'document must be a valid 11-digit CPF or 14-digit CNPJ (numbers only)',
  })
  document: string;

  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3nhaForte!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserType, example: UserType.COMMON })
  @IsEnum(UserType)
  type: UserType;

  @ApiProperty({
    example: 10000,
    required: false,
    description: 'Saldo inicial em centavos (ex: 10000 = R$ 100,00)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  initialBalanceCents?: number;
}
