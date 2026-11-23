import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserType } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

export interface PublicUser {
  id: string;
  fullName: string;
  document: string;
  email: string;
  type: UserType;
  balanceCents: number;
  createdAt: Date;
}

const PUBLIC_USER_SELECT = {
  id: true,
  fullName: true,
  document: true,
  email: true,
  type: true,
  balanceCents: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(dto.password, salt, 64).toString('hex');
    const passwordHash = `${salt}:${derivedKey}`;

    try {
      return await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          document: dto.document,
          email: dto.email.toLowerCase(),
          passwordHash,
          type: dto.type,
          balanceCents: dto.initialBalanceCents ?? 0,
        },
        select: PUBLIC_USER_SELECT,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Document or email already registered');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
