import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return subs.map((s) => this.enrichSubscription(s));
  }

  async findUpcoming(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active' },
    });
    return subs
      .map((s) => this.enrichSubscription(s))
      .filter((s) => s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 30)
      .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);
  }

  async findOne(id: number, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id, userId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.enrichSubscription(sub);
  }

  async create(dto: CreateSubscriptionDto, userId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { name: dto.name.trim(), userId },
    });
    if (existing) throw new ConflictException('A subscription with this name already exists');

    if (!dto.billingDay || dto.billingDay < 1 || dto.billingDay > 31) {
      throw new BadRequestException('billingDay must be between 1 and 31');
    }

    const sub = await this.prisma.subscription.create({
      data: {
        name: dto.name.trim(),
        category: dto.category || 'other',
        cost: dto.cost ?? 0,
        billingDay: dto.billingDay,
        billingMonth: dto.billingMonth,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        status: dto.status || 'active',
        notes: dto.notes || '',
        currency: dto.currency || 'USD',
        userId,
      },
    });

    return this.enrichSubscription(sub);
  }

  async update(id: number, dto: UpdateSubscriptionDto, userId: string) {
    await this.findOne(id, userId);

    if (dto.name) {
      const conflict = await this.prisma.subscription.findFirst({
        where: { name: dto.name.trim(), userId, NOT: { id } },
      });
      if (conflict) throw new ConflictException('A subscription with this name already exists');
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.cost !== undefined && { cost: dto.cost }),
        ...(dto.billingDay !== undefined && { billingDay: dto.billingDay }),
        ...(dto.billingMonth !== undefined && { billingMonth: dto.billingMonth }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });

    return this.enrichSubscription(updated);
  }

  async remove(id: number, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.subscription.delete({ where: { id } });
    return { message: 'Subscription deleted' };
  }

  getNextRenewalDate(billingDay: number, billingMonth: string, startDate: Date): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bm = billingMonth.toLowerCase();

    if (bm === 'monthly') {
      let candidate = new Date(today.getFullYear(), today.getMonth(), billingDay);
      if (candidate <= today) {
        candidate = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
      }
      return candidate;
    }

    if (bm === 'yearly') {
      const start = new Date(startDate);
      let candidate = new Date(today.getFullYear(), start.getMonth(), billingDay);
      if (candidate <= today) {
        candidate = new Date(today.getFullYear() + 1, start.getMonth(), billingDay);
      }
      return candidate;
    }

    const monthIdx = MONTH_NAMES.indexOf(bm.slice(0, 3));
    if (monthIdx !== -1) {
      let candidate = new Date(today.getFullYear(), monthIdx, billingDay);
      if (candidate <= today) {
        candidate = new Date(today.getFullYear() + 1, monthIdx, billingDay);
      }
      return candidate;
    }

    // fallback: treat as monthly
    let candidate = new Date(today.getFullYear(), today.getMonth(), billingDay);
    if (candidate <= today) {
      candidate = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    }
    return candidate;
  }

  getDaysUntil(date: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  }

  private enrichSubscription(sub: any) {
    const nextRenewalDate = this.getNextRenewalDate(sub.billingDay, sub.billingMonth, sub.startDate);
    const daysUntilRenewal = this.getDaysUntil(nextRenewalDate);
    return {
      ...sub,
      cost: Number(sub.cost),
      nextRenewalDate: nextRenewalDate.toISOString().split('T')[0],
      daysUntilRenewal,
    };
  }
}
