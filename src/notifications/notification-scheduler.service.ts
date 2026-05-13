import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyCheck() {
    this.logger.log('Running hourly notification check...');

    const users = await this.prisma.user.findMany({
      where: { isActive: true, isVerified: true },
      select: { id: true },
    });

    let totalCreated = 0;
    for (const user of users) {
      try {
        const count = await this.notificationsService.checkAndCreateForUser(user.id);
        totalCreated += count;
      } catch (err) {
        this.logger.error(`Notification check failed for user ${user.id}: ${err.message}`);
      }
    }

    if (totalCreated > 0) {
      this.logger.log(`Created ${totalCreated} notifications across all users`);
    }

    await this.cleanupExpiredData();
  }

  private async cleanupExpiredData() {
    try {
      await this.prisma.$transaction([
        this.prisma.otpCode.deleteMany({
          where: { OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }] },
        }),
        this.prisma.refreshToken.deleteMany({
          where: { OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }] },
        }),
      ]);
    } catch (err) {
      this.logger.warn(`Cleanup failed: ${err.message}`);
    }
  }
}
