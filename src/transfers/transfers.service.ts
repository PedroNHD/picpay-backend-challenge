import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Transaction, UserType } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  TransferNotificationJob,
} from '../notifications/notification.processor';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizerService } from './authorizer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

interface LockedUserRow {
  id: string;
  email: string;
  type: UserType;
  balance_cents: number;
}

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizer: AuthorizerService,
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue<TransferNotificationJob>,
  ) {}

  async execute(
    dto: CreateTransferDto,
    idempotencyKey?: string,
  ): Promise<Transaction> {
    if (dto.payer === dto.payee) {
      throw new BadRequestException('Payer and payee must be different users');
    }

    const amountCents = Math.round(dto.value * 100);
    if (amountCents <= 0) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }

    if (idempotencyKey) {
      const existing = await this.prisma.transaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    const { transaction, payeeEmail } = await this.prisma.$transaction(
      async (tx) => {
        // Ordered lock (ORDER BY id ASC) prevents deadlocks on concurrent A->B and B->A transfers
        const lockedUsers = await tx.$queryRaw<LockedUserRow[]>`
          SELECT id, email, type, balance_cents
          FROM users
          WHERE id IN (${dto.payer}, ${dto.payee})
          ORDER BY id ASC
          FOR UPDATE
        `;

        const payer = lockedUsers.find((u) => u.id === dto.payer);
        const payee = lockedUsers.find((u) => u.id === dto.payee);

        if (!payer || !payee) {
          throw new NotFoundException('Payer or payee not found');
        }

        if (payer.type === UserType.MERCHANT) {
          throw new ForbiddenException('Merchants cannot initiate transfers');
        }

        if (payer.balance_cents < amountCents) {
          throw new UnprocessableEntityException('Insufficient balance');
        }

        const authorized = await this.authorizer.isAuthorized();
        if (!authorized) {
          throw new ForbiddenException('Transfer denied by external authorizer');
        }

        await tx.user.update({
          where: { id: payer.id },
          data: { balanceCents: { decrement: amountCents } },
        });

        await tx.user.update({
          where: { id: payee.id },
          data: { balanceCents: { increment: amountCents } },
        });

        const created = await tx.transaction.create({
          data: {
            idempotencyKey: idempotencyKey ?? null,
            payerId: payer.id,
            payeeId: payee.id,
            amountCents,
          },
        });

        return { transaction: created, payeeEmail: payee.email };
      },
    );

    // Enqueue notification outside the DB transaction so notifier/Redis outages never roll back committed money movement
    try {
      await this.notificationsQueue.add('transfer-received', {
        transactionId: transaction.id,
        payeeEmail,
        amountCents: transaction.amountCents,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to enqueue notification for tx=${transaction.id}`,
        error,
      );
    }

    return transaction;
  }
}
