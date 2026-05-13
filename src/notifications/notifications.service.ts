import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { subscription: { userId } },
      include: { subscription: { select: { name: true } } },
      orderBy: { sentAt: 'desc' },
    });
  }

  async markRead(id: number, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, subscription: { userId } },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async triggerCheck(userId: string) {
    const count = await this.checkAndCreateForUser(userId);
    return { message: `Notification check complete`, created: count };
  }

  async checkAndCreateForUser(userId: string): Promise<number> {
    const prefs = await this.prisma.notificationPreferences.findUnique({ where: { userId } });
    const triggerDays = [prefs?.daysFirst ?? 7, prefs?.daysSecond ?? 3, 0];

    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId, status: 'active' },
    });

    let created = 0;
    const now = new Date();

    for (const sub of subscriptions) {
      const nextRenewal = this.getNextRenewalDate(sub.billingDay, sub.billingMonth, sub.startDate);
      const daysUntil = this.getDaysUntil(nextRenewal);

      for (const triggerDay of triggerDays) {
        if (daysUntil !== triggerDay) continue;

        const cutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
        const existing = await this.prisma.notification.findFirst({
          where: {
            subscriptionId: sub.id,
            triggerDays: triggerDay,
            sentAt: { gt: cutoff },
          },
        });

        if (!existing) {
          const message =
            triggerDay === 0
              ? `${sub.name} renews today!`
              : `${sub.name} renews in ${triggerDay} day${triggerDay === 1 ? '' : 's'}`;

          await this.prisma.notification.create({
            data: { subscriptionId: sub.id, message, triggerDays: triggerDay },
          });
          created++;
        }
      }
    }

    return created;
  }

  private getNextRenewalDate(billingDay: number, billingMonth: string, startDate: Date): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bm = billingMonth.toLowerCase();
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    if (bm === 'monthly') {
      let d = new Date(today.getFullYear(), today.getMonth(), billingDay);
      if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
      return d;
    }

    if (bm === 'yearly') {
      const start = new Date(startDate);
      let d = new Date(today.getFullYear(), start.getMonth(), billingDay);
      if (d <= today) d = new Date(today.getFullYear() + 1, start.getMonth(), billingDay);
      return d;
    }

    const idx = monthNames.indexOf(bm.slice(0, 3));
    if (idx !== -1) {
      let d = new Date(today.getFullYear(), idx, billingDay);
      if (d <= today) d = new Date(today.getFullYear() + 1, idx, billingDay);
      return d;
    }

    let d = new Date(today.getFullYear(), today.getMonth(), billingDay);
    if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    return d;
  }

  private getDaysUntil(date: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  }
}
