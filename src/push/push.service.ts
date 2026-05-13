import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidConfigured: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const email = config.get<string>('VAPID_EMAIL');
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');

    if (email && publicKey && privateKey) {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn('VAPID keys not configured — push notifications disabled');
      this.vapidConfigured = false;
    }
  }

  getVapidPublicKey() {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') || null };
  }

  async subscribe(userId: string, dto: SubscribeDto, ua: string) {
    const deviceHint = this.detectDevice(ua);

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        p256dh: dto.keys.p256dh,
        authKey: dto.keys.auth,
        deviceHint,
        userAgent: ua,
        isActive: true,
      },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        authKey: dto.keys.auth,
        deviceHint,
        userAgent: ua,
      },
    });

    return { message: 'Push subscription registered' };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { userId, endpoint },
      data: { isActive: false },
    });
    return { message: 'Push subscription removed' };
  }

  async sendTest(userId: string) {
    const payload = JSON.stringify({
      title: 'Circula Test',
      body: 'Push notifications are working!',
      icon: '/icon-192.png',
    });
    await this.sendToUser(userId, payload);
    return { message: 'Test notification sent' };
  }

  async getDevices(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      select: { id: true, deviceHint: true, createdAt: true, lastUsedAt: true },
    });
  }

  async removeDevice(userId: string, deviceId: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { id: deviceId, userId },
      data: { isActive: false },
    });
    return { message: 'Device removed' };
  }

  async sendPendingPushNotifications(userId: string) {
    if (!this.vapidConfigured) return;

    const recentNotifications = await this.prisma.notification.findMany({
      where: {
        subscription: { userId },
        sentAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
      include: { subscription: { select: { name: true, currency: true, cost: true } } },
      orderBy: { sentAt: 'desc' },
      take: 10,
    });

    for (const n of recentNotifications) {
      const isToday = n.triggerDays === 0;
      const payload = JSON.stringify({
        title: isToday ? '🔔 Renewal Today!' : '⏰ Upcoming Renewal',
        body: n.message,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: `renewal-${n.subscriptionId}-${n.triggerDays}`,
        requireInteraction: isToday,
        data: { notificationId: n.id, subscriptionId: n.subscriptionId },
      });

      await this.sendToUser(userId, payload);
    }
  }

  private async sendToUser(userId: string, payload: string) {
    const devices = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });

    for (const device of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.authKey } },
          payload,
        );
        await this.prisma.pushSubscription.update({
          where: { id: device.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.prisma.pushSubscription.update({
            where: { id: device.id },
            data: { isActive: false },
          });
        } else {
          this.logger.warn(`Push failed for device ${device.id}: ${err.message}`);
        }
      }
    }
  }

  private detectDevice(ua: string): string {
    const u = ua.toLowerCase();
    if (u.includes('iphone') || u.includes('ipad')) return 'ios';
    if (u.includes('android')) return 'android';
    if (u.includes('mobile')) return 'mobile';
    return 'desktop';
  }
}
