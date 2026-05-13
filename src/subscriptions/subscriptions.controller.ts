import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, VerifiedEmailGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all subscriptions' })
  findAll(@CurrentUser() user: any) {
    return this.subscriptionsService.findAll(user.id);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get subscriptions renewing within the next 30 days' })
  findUpcoming(@CurrentUser() user: any) {
    return this.subscriptionsService.findUpcoming(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription by ID' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.subscriptionsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new subscription' })
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: any) {
    return this.subscriptionsService.create(dto, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a subscription' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: any,
  ) {
    return this.subscriptionsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.subscriptionsService.remove(id, user.id);
  }
}
