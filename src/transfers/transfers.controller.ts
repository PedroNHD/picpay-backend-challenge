import { Body, Controller, Headers, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiTags,
} from '@nestjs/swagger';
import { Transaction } from '@prisma/client';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@Controller('transfer')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Chave única para garantir idempotência em retentativas',
  })
  @ApiCreatedResponse({ description: 'Transferência concluída com sucesso' })
  create(
    @Body() dto: CreateTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Transaction> {
    return this.transfersService.execute(dto, idempotencyKey);
  }
}
