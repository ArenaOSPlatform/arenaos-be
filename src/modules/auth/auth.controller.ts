import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { Roles } from './decorator/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { UserRole } from './constants/user-role';
import { RateLimit } from './decorator/rate-limit.decorator';
import { RateLimitGuard } from './guards/rate-limit.guard';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from './refresh-token-cookie';

type AccessTokenRequest = Request & {
  user: {
    sub: string;
    email: string;
    username: string;
    role: UserRole;
  };
};

type RefreshTokenRequest = Request & {
  user: {
    sub: string;
    email: string;
    username: string;
    role: UserRole;
    refreshToken: string;
  };
};

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private sendAuthResponse(
    response: Response,
    result: {
      message: string;
      data: {
        refreshToken: string;
        [key: string]: unknown;
      };
    },
  ) {
    setRefreshTokenCookie(response, result.data.refreshToken);
    const data: Record<string, unknown> = { ...result.data };
    delete data.refreshToken;

    return { ...result, data };
  }

  @Post('register')
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000 })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);
    return this.sendAuthResponse(response, result);
  }

  @Post('login')
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    return this.sendAuthResponse(response, result);
  }

  @Post('google')
  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000 })
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginWithGoogle(dto);
    return this.sendAuthResponse(response, result);
  }

  @Post('forgot-password')
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('verify-reset-otp')
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto);
  }

  @Post('reset-password')
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000 })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AccessTokenRequest) {
    return this.authService.getMe(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: AccessTokenRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  @UseGuards(RefreshTokenGuard)
  @Post(['refresh-token', 'refresh'])
  async refresh(
    @Req() req: RefreshTokenRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      req.user.sub,
      req.user.refreshToken,
    );
    return this.sendAuthResponse(response, result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: AccessTokenRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(req.user.sub);
    clearRefreshTokenCookie(response);
    return result;
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin-test')
  adminTest() {
    return {
      message: 'Only admin can access this route',
    };
  }
}
