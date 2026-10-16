import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../../../common/auth-user';
import { AllowPendingPasswordChange, CurrentUser, Public } from '../../../common/decorators';
import { ChangePasswordRequestDto, LoginRequestDto } from '../dto/auth.dto';
import { AuthService } from '../services/auth.service';

// Không có đăng ký và quên mật khẩu: tài khoản do Admin cấp (BR-AUTH-01, BR-AUTH-05)
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginRequestDto) {
    return this.auth.login(body.username, body.password);
  }

  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth()
  @AllowPendingPasswordChange()
  @Put('me/password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordRequestDto) {
    await this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }
}
