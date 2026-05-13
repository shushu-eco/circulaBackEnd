import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = config.get('SMTP_HOST');
    const user = config.get('SMTP_USER');
    const pass = config.get('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get<number>('SMTP_PORT', 587),
        secure: config.get('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — emails will be skipped');
    }
  }

  async sendOtp(email: string, name: string, otp: string, type: 'verify' | 'reset') {
    if (!this.transporter) return;

    const isVerify = type === 'verify';
    const subject = isVerify ? 'Verify your Circula account' : 'Reset your Circula password';
    const heading = isVerify ? 'Email Verification' : 'Password Reset';
    const purpose = isVerify
      ? 'verify your email address'
      : 'reset your password';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;background:#f4f4f4;padding:40px 0;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#6366f1;padding:32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:-0.5px;">Circula</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#111;">${heading}</h2>
            <p style="color:#555;margin:0 0 24px;">Hi ${name}, use the code below to ${purpose}:</p>
            <div style="text-align:center;margin:24px 0;">
              <span style="display:inline-block;background:#f0f0ff;border:2px dashed #6366f1;border-radius:8px;padding:16px 32px;font-size:36px;font-weight:700;letter-spacing:8px;color:#6366f1;">${otp}</span>
            </div>
            <p style="color:#888;font-size:13px;text-align:center;">This code expires in 10 minutes. Do not share it with anyone.</p>
          </div>
          <div style="background:#f9f9f9;padding:16px;text-align:center;">
            <p style="color:#aaa;font-size:12px;margin:0;">© ${new Date().getFullYear()} Circula. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', 'Circula <noreply@circula.app>'),
        to: email,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}: ${err.message}`);
    }
  }

  async sendWelcome(email: string, name: string) {
    if (!this.transporter) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;background:#f4f4f4;padding:40px 0;">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <div style="background:#6366f1;padding:32px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">Circula</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 8px;color:#111;">Welcome, ${name}! 🎉</h2>
            <p style="color:#555;">Your account is verified. Start tracking your subscriptions today.</p>
          </div>
          <div style="background:#f9f9f9;padding:16px;text-align:center;">
            <p style="color:#aaa;font-size:12px;margin:0;">© ${new Date().getFullYear()} Circula. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', 'Circula <noreply@circula.app>'),
        to: email,
        subject: 'Welcome to Circula!',
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send welcome email: ${err.message}`);
    }
  }
}
