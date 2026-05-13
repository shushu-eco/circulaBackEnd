import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PushService } from './push.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Push Notifications')
@Controller('push')
export class PushController {
  constructor(private pushService: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for service worker registration' })
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Register a push subscription' })
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: any, @Req() req: Request) {
    const ua = req.headers['user-agent'] || '';
    return this.pushService.subscribe(user.id, dto, ua);
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a push subscription' })
  unsubscribe(@Body('endpoint') endpoint: string, @CurrentUser() user: any) {
    return this.pushService.unsubscribe(user.id, endpoint);
  }

  @Post('test')
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send a test push notification' })
  sendTest(@CurrentUser() user: any) {
    return this.pushService.sendTest(user.id);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all registered push devices' })
  getDevices(@CurrentUser() user: any) {
    return this.pushService.getDevices(user.id);
  }

  @Delete('devices/:id')
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a registered push device' })
  removeDevice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pushService.removeDevice(user.id, id);
  }
}
