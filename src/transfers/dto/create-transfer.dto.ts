import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ example: 100.5, description: 'Valor da transferência em reais (ex: 100.50)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value: number;

  @ApiProperty({ format: 'uuid', description: 'ID do pagador (usuário COMMON)' })
  @IsUUID()
  payer: string;

  @ApiProperty({ format: 'uuid', description: 'ID do recebedor (COMMON ou MERCHANT)' })
  @IsUUID()
  payee: string;
}
