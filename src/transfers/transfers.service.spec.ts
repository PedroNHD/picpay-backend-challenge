import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TransactionStatus, UserType } from '@prisma/client';
import { Queue } from 'bullmq';
import { TransferNotificationJob } from '../notifications/notification.processor';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizerService } from './authorizer.service';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  let service: TransfersService;
  let prisma: {
    transaction: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let txClient: {
    $queryRaw: jest.Mock;
    user: { update: jest.Mock };
    transaction: { create: jest.Mock };
  };
  let authorizer: { isAuthorized: jest.Mock };
  let notificationsQueue: { add: jest.Mock };

  const payerId = '11111111-1111-4111-8111-111111111111';
  const payeeId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    txClient = {
      $queryRaw: jest.fn(),
      user: { update: jest.fn() },
      transaction: { create: jest.fn() },
    };

    prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (tx: typeof txClient) => Promise<unknown>) =>
        cb(txClient),
      ),
    };

    authorizer = { isAuthorized: jest.fn().mockResolvedValue(true) };
    notificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };

    service = new TransfersService(
      prisma as unknown as PrismaService,
      authorizer as unknown as AuthorizerService,
      notificationsQueue as unknown as Queue<TransferNotificationJob>,
    );
  });

  it('completes a valid transfer and enqueues notification', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'payer@test.com', type: UserType.COMMON, balance_cents: 20000 },
      { id: payeeId, email: 'payee@test.com', type: UserType.MERCHANT, balance_cents: 5000 },
    ]);

    const createdTx = {
      id: 'tx-1',
      idempotencyKey: 'idem-1',
      payerId,
      payeeId,
      amountCents: 10050,
      status: TransactionStatus.COMPLETED,
      createdAt: new Date(),
    };
    txClient.transaction.create.mockResolvedValue(createdTx);

    const result = await service.execute(
      { payer: payerId, payee: payeeId, value: 100.5 },
      'idem-1',
    );

    expect(result).toEqual(createdTx);
    expect(txClient.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: payerId },
      data: { balanceCents: { decrement: 10050 } },
    });
    expect(txClient.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: payeeId },
      data: { balanceCents: { increment: 10050 } },
    });
    expect(notificationsQueue.add).toHaveBeenCalledWith('transfer-received', {
      transactionId: 'tx-1',
      payeeEmail: 'payee@test.com',
      amountCents: 10050,
    });
  });

  it('returns existing transaction without debiting again when idempotencyKey matches', async () => {
    const existingTx = {
      id: 'tx-existing',
      idempotencyKey: 'idem-dup',
      payerId,
      payeeId,
      amountCents: 5000,
      status: TransactionStatus.COMPLETED,
      createdAt: new Date(),
    };
    prisma.transaction.findUnique.mockResolvedValue(existingTx);

    const result = await service.execute(
      { payer: payerId, payee: payeeId, value: 50 },
      'idem-dup',
    );

    expect(result).toEqual(existingTx);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects self-transfer', async () => {
    await expect(
      service.execute({ payer: payerId, payee: payerId, value: 10 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when payer or payee does not exist', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'payer@test.com', type: UserType.COMMON, balance_cents: 10000 },
    ]);

    await expect(
      service.execute({ payer: payerId, payee: payeeId, value: 10 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('forbids MERCHANT from initiating transfers', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'shop@test.com', type: UserType.MERCHANT, balance_cents: 50000 },
      { id: payeeId, email: 'user@test.com', type: UserType.COMMON, balance_cents: 0 },
    ]);

    await expect(
      service.execute({ payer: payerId, payee: payeeId, value: 10 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when payer has insufficient balance', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'payer@test.com', type: UserType.COMMON, balance_cents: 500 },
      { id: payeeId, email: 'payee@test.com', type: UserType.COMMON, balance_cents: 0 },
    ]);

    await expect(
      service.execute({ payer: payerId, payee: payeeId, value: 10 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('aborts transaction when external authorizer denies transfer', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'payer@test.com', type: UserType.COMMON, balance_cents: 10000 },
      { id: payeeId, email: 'payee@test.com', type: UserType.COMMON, balance_cents: 0 },
    ]);
    authorizer.isAuthorized.mockResolvedValue(false);

    await expect(
      service.execute({ payer: payerId, payee: payeeId, value: 50 }),
    ).rejects.toThrow(ForbiddenException);
    expect(txClient.user.update).not.toHaveBeenCalled();
  });

  it('does not fail committed transfer if notification queue is temporarily unavailable', async () => {
    txClient.$queryRaw.mockResolvedValue([
      { id: payerId, email: 'payer@test.com', type: UserType.COMMON, balance_cents: 10000 },
      { id: payeeId, email: 'payee@test.com', type: UserType.COMMON, balance_cents: 0 },
    ]);
    const createdTx = {
      id: 'tx-2',
      idempotencyKey: null,
      payerId,
      payeeId,
      amountCents: 2500,
      status: TransactionStatus.COMPLETED,
      createdAt: new Date(),
    };
    txClient.transaction.create.mockResolvedValue(createdTx);
    notificationsQueue.add.mockRejectedValue(new Error('Redis down'));

    const result = await service.execute({
      payer: payerId,
      payee: payeeId,
      value: 25,
    });

    expect(result).toEqual(createdTx);
  });
});
