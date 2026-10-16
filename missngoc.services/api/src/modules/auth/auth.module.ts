import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './services/auth.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        // Không cho chạy thật với secret mẫu hoặc quá ngắn
        if (process.env.NODE_ENV === 'production' && (secret.length < 32 || secret.startsWith('doi-thanh'))) {
          throw new Error('JWT_SECRET còn là giá trị mẫu hoặc ngắn hơn 32 ký tự. Đổi trong .env rồi chạy lại');
        }
        return { secret, signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '30d') } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
