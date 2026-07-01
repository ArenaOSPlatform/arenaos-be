import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../decorator/rate-limit.decorator';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const email = this.getEmail(request);
    const identity = email ? `${request.ip}:${email}` : request.ip;
    const key = `${request.method}:${request.path}:${identity}`;
    const now = Date.now();
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + options.windowMs });
      this.cleanupExpiredEntries(now);
      return true;
    }

    if (current.count >= options.limit) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }

  private getEmail(request: Request): string | undefined {
    const body = request.body as { email?: unknown } | undefined;
    return typeof body?.email === 'string'
      ? body.email.trim().toLowerCase()
      : undefined;
  }

  private cleanupExpiredEntries(now: number): void {
    if (this.entries.size < 1000) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
