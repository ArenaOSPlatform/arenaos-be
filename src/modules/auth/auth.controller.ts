import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AccessTokenRequest) {
    return this.authService.getMe(req.user.sub);
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
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
