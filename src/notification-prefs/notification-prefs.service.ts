import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePrefsDto } from './dto/update-prefs.dto';

@Injectable()
export class NotificationPrefsService {
  constructor(private prisma: PrismaService) {}

  async getPrefs(userId: string) {
    const prefs = await this.prisma.notificationPreferences.findUnique({ where: { userId } });
    return prefs ?? { daysFirst: 7, daysSecond: 3, renewalDay: 0 };
  }

  async updatePrefs(userId: string, dto: UpdatePrefsDto) {
    const prefs = await this.prisma.notificationPreferences.upsert({
      where: { userId },
      update: {
        ...(dto.daysFirst !== undefined && { daysFirst: dto.daysFirst }),
        ...(dto.daysSecond !== undefined && { daysSecond: dto.daysSecond }),
      },
      create: {
        userId,
        daysFirst: dto.daysFirst ?? 7,
        daysSecond: dto.daysSecond ?? 3,
      },
    });
    return prefs;
  }
}
