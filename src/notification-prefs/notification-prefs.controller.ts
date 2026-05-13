import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationPrefsService } from './notification-prefs.service';
import { UpdatePrefsDto } from './dto/update-prefs.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notification Preferences')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, VerifiedEmailGuard)
@Controller('notification-prefs')
export class NotificationPrefsController {
  constructor(private prefsService: NotificationPrefsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notification preferences' })
  getPrefs(@CurrentUser() user: any) {
    return this.prefsService.getPrefs(user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePrefs(@CurrentUser() user: any, @Body() dto: UpdatePrefsDto) {
    return this.prefsService.updatePrefs(user.id, dto);
  }
}
