import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { generateOtp, hashOtp, verifyOtp } from './utils/otp.utils';
import { generateRefreshToken, hashRefreshToken } from './utils/token.utils';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const DUMMY_HASH = '$2b$12$dummyhashfortimingttttttttttttttttttttttttttttttttttt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;
  private readonly otpLength: number;
  private readonly otpExpiresMins: number;
  private readonly refreshExpiresMs: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private config: ConfigService,
  ) {
    this.bcryptRounds = parseInt(config.get('BCRYPT_ROUNDS', '12'), 10);
    this.otpLength = parseInt(config.get('OTP_LENGTH', '6'), 10);
    this.otpExpiresMins = parseInt(config.get('OTP_EXPIRES_MINUTES', '10'), 10);
    this.refreshExpiresMs = 7 * 24 * 60 * 60 * 1000;
  }

  async register(dto: RegisterDto, ip: string, ua: string) {
    const email = dto.email.trim().toLowerCase();

    await this.log('REGISTER_ATTEMPT', null, ip, ua, { email });

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.isVerified) {
        await this.prisma.user.delete({ where: { id: existing.id } });
      } else {
        throw new ConflictException('Email already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, fullName: dto.fullName.trim() },
    });

    const otp = generateOtp(this.otpLength);
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        code: await hashOtp(otp),
        type: 'email_verify',
        expiresAt: new Date(Date.now() + this.otpExpiresMins * 60_000),
      },
    });

    await this.emailService.sendOtp(email, user.fullName, otp, 'verify');
    await this.log('REGISTER_SUCCESS', user.id, ip, ua);

    return { message: 'Registration successful. Please check your email for the verification code.' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new BadRequestException('Email already verified');

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { userId: user.id, type: 'email_verify', isUsed: false },
      orderBy: { createdAt: 'desc' },
    });

    await this.validateOtp(otpRecord, dto.otp);

    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { isUsed: true } }),
      this.prisma.user.update({ where: { id: user.id }, data: { isVerified: true } }),
    ]);

    await this.emailService.sendWelcome(email, user.fullName);
    await this.log('OTP_VERIFIED', user.id, '', '');

    return { message: 'Email verified successfully.' };
  }

  async resendOtp(dto: ResendOtpDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified) throw new BadRequestException('Email already verified');

    await this.prisma.otpCode.updateMany({
      where: { userId: user.id, type: 'email_verify', isUsed: false },
      data: { isUsed: true },
    });

    const otp = generateOtp(this.otpLength);
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        code: await hashOtp(otp),
        type: 'email_verify',
        expiresAt: new Date(Date.now() + this.otpExpiresMins * 60_000),
      },
    });

    await this.emailService.sendOtp(email, user.fullName, otp, 'verify');
    return { message: 'Verification code resent.' };
  }

  async login(dto: LoginDto, ip: string, ua: string) {
    const email = dto.email.trim().toLowerCase();
    await this.log('LOGIN_ATTEMPT', null, ip, ua, { email });

    const user = await this.prisma.user.findUnique({ where: { email } });
    const hashToCheck = user?.passwordHash || DUMMY_HASH;
    const isValid = await bcrypt.compare(dto.password, hashToCheck);

    if (!user || !isValid) {
      await this.log('LOGIN_FAIL', user?.id || null, ip, ua, { reason: 'invalid_credentials' });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Please verify your email before logging in');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const { accessToken, refreshToken } = await this.createTokenPair(user.id, user.email, ip, ua);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.log('LOGIN_SUCCESS', user.id, ip, ua);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    };
  }

  async refresh(refreshToken: string, ip: string, ua: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, email: true, isActive: true } } },
    });

    if (!stored || !stored.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });

    const { accessToken, refreshToken: newRefreshToken } = await this.createTokenPair(
      stored.userId,
      stored.user.email,
      ip,
      ua,
    );

    await this.log('TOKEN_REFRESH', stored.userId, ip, ua);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, refreshToken: string) {
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { isRevoked: true },
      });
    }
    await this.log('LOGOUT', userId, '', '');
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    await this.log('LOGOUT_ALL', userId, '', '');
    return { message: 'Logged out from all devices' };
  }

  async forgotPassword(dto: ForgotPasswordDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    await this.log('PASSWORD_RESET_REQUEST', null, ip, '', { email });

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { message: 'If that email is registered, a reset code has been sent.' };
    }

    await this.prisma.otpCode.updateMany({
      where: { userId: user.id, type: 'password_reset', isUsed: false },
      data: { isUsed: true },
    });

    const otp = generateOtp(this.otpLength);
    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        code: await hashOtp(otp),
        type: 'password_reset',
        expiresAt: new Date(Date.now() + this.otpExpiresMins * 60_000),
      },
    });

    await this.emailService.sendOtp(email, user.fullName, otp, 'reset');
    return { message: 'If that email is registered, a reset code has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { userId: user.id, type: 'password_reset', isUsed: false },
      orderBy: { createdAt: 'desc' },
    });

    await this.validateOtp(otpRecord, dto.otp);

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { isUsed: true } }),
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { isRevoked: true } }),
    ]);

    await this.log('PASSWORD_RESET_SUCCESS', user.id, '', '');
    return { message: 'Password reset successfully. Please log in again.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isVerified: true, createdAt: true, lastLoginAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async exportData(userId: string) {
    const [user, subscriptions, notifications, prefs, devices] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, isVerified: true, createdAt: true },
      }),
      this.prisma.subscription.findMany({ where: { userId } }),
      this.prisma.notification.findMany({
        where: { subscription: { userId } },
        include: { subscription: { select: { name: true } } },
      }),
      this.prisma.notificationPreferences.findUnique({ where: { userId } }),
      this.prisma.pushSubscription.findMany({
        where: { userId, isActive: true },
        select: { id: true, deviceHint: true, createdAt: true },
      }),
    ]);

    return { user, subscriptions, notifications, preferences: prefs, devices, exportedAt: new Date() };
  }

  async deleteAccount(userId: string, confirmation: string) {
    if (confirmation !== 'DELETE') throw new BadRequestException('Confirmation must be "DELETE"');

    await this.prisma.user.delete({ where: { id: userId } });
    await this.log('ACCOUNT_DELETED', userId, '', '');
    return { message: 'Account deleted successfully' };
  }

  private async createTokenPair(userId: string, email: string, ip: string, ua: string) {
    const accessToken = this.jwtService.sign({ sub: userId, email });
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshExpiresMs);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, ipAddress: ip, userAgent: ua },
    });

    return { accessToken, refreshToken };
  }

  private async validateOtp(otpRecord: any, code: string) {
    if (!otpRecord) throw new BadRequestException('No pending verification code found');
    if (otpRecord.expiresAt < new Date()) throw new BadRequestException('Verification code has expired');
    if (otpRecord.attempts >= 5) throw new BadRequestException('Too many failed attempts. Request a new code.');

    const isMatch = await verifyOtp(code, otpRecord.code);
    if (!isMatch) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }
  }

  private async log(event: string, userId: string | null, ip: string, ua: string, metadata?: any) {
    try {
      await this.prisma.authLog.create({
        data: { event, userId, ipAddress: ip, userAgent: ua, metadata },
      });
    } catch (err) {
      this.logger.warn(`Failed to write auth log: ${err.message}`);
    }
  }
}
