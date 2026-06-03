import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class PasswordResetMailService {
  private readonly logger = new Logger(PasswordResetMailService.name);
  private transporter: Transporter | null = null;

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return null;
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure =
      process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  async sendPasswordResetOtp(email: string, otp: string) {
    const transporter = this.getTransporter();
    const expiresInMinutes = process.env.PASSWORD_RESET_OTP_TTL_MINUTES ?? '10';

    if (!transporter) {
      this.logger.warn(
        `SMTP is not configured. Password reset OTP for ${email}: ${otp}`,
      );
      return;
    }

    const from = process.env.SMTP_FROM ?? 'ArenaOS <no-reply@arenaos.com>';

    await transporter.sendMail({
      from,
      to: email,
      subject: 'ArenaOS password reset OTP',
      text: [
        `Your ArenaOS password reset OTP is ${otp}.`,
        `This code expires in ${expiresInMinutes} minutes.`,
        'If you did not request this, ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
          <h2>ArenaOS password reset</h2>
          <p>Use this OTP to reset your password:</p>
          <p style="font-size:28px;font-weight:800;letter-spacing:8px">${otp}</p>
          <p>This code expires in ${expiresInMinutes} minutes.</p>
          <p>If you did not request this, ignore this email.</p>
        </div>
      `,
    });
  }
}
