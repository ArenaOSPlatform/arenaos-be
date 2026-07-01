import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '../../config/environment';

export const REFRESH_TOKEN_COOKIE = 'arenaos_refresh_token';

function getCookieOptions(): CookieOptions {
  const production = isProduction();

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/auth',
  };
}

export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getCookieOptions());
}

export function clearRefreshTokenCookie(response: Response): void {
  const options = getCookieOptions();
  delete options.maxAge;
  response.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

export function getRefreshTokenFromRequest(
  request: Request,
): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');

    if (rawName === REFRESH_TOKEN_COOKIE) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return undefined;
}
