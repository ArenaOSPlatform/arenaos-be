import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
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
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('verify-reset-otp')
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto);
  }

  @Post('reset-password')
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
  refresh(@Req() req: RefreshTokenRequest) {
    return this.authService.refresh(req.user.sub, req.user.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: AccessTokenRequest) {
    return this.authService.logout(req.user.sub);
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
