import { AppError } from '../../core/errors/app-error';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/utils/jwt';
import { comparePassword, hashPassword } from '../../core/utils/password';
import { redisSession } from '../../database/redis';
import { brevoService } from '../../integrations/email/brevo.service';
import { welcomeTemplate } from '../../integrations/email/templates/welcome.template';

import { authRepository } from './auth.repository';
import { LoginInput, RegisterInput } from './auth.types';

class AuthService {
  async register(input: RegisterInput) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError('Email is already registered', 409, 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      passwordHash
    });

    const authResponse = await this.buildAuthResponse(user);

    // Send welcome email (fire-and-forget — don't block registration)
    brevoService
      .sendWithAdminNotify({
        to: user.email,
        toName: user.name,
        subject: `Welcome to Grow Up More, ${user.name}!`,
        html: welcomeTemplate(user.name)
      })
      .catch((err) => {
        // Log but don't fail registration if email fails
        console.error('Welcome email failed:', err);
      });

    return authResponse;
  }

  async login(input: LoginInput) {
    const user = await authRepository.findUserByEmail(input.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    let payload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Check if refresh token is still valid in Redis (not revoked)
    const isValid = await redisSession.isValid(payload.userId, refreshToken);
    if (!isValid) {
      throw new AppError('Refresh token has been revoked', 401, 'REFRESH_TOKEN_REVOKED');
    }

    const user = await authRepository.findUserById(payload.userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return this.buildAuthResponse(user);
  }

  async logout(userId: string) {
    await redisSession.revoke(userId);
    return { message: 'Logged out successfully' };
  }

  private async buildAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }) {
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // Store refresh token in Redis for revocable sessions
    await redisSession.store(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      tokens: {
        accessToken,
        refreshToken
      }
    };
  }
}

export const authService = new AuthService();
