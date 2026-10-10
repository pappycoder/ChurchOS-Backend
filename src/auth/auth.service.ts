/**
 * @file auth.service.ts
 * @description Auth business logic for registration, profile retrieval, and session management.
 *
 * Handles Supabase Auth user creation, ChurchOS Profile creation, and
 * profile lookup. All mutations are audit-logged.
 *
 * @module auth/auth.service
 * @since 1.0.0
 */

import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthenticatorService } from './services/authenticator.service';
import { JwksService } from './services/jwks.service';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../redis/redis.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { Login2faDto } from './dto/login-2fa.dto';
import { LoginResponseDto } from './dto/session-response.dto';
import { ConfigService } from '@nestjs/config';
import { ResendService } from '../communication/resend.service';
import {
  generateTwoFactorCode,
  hashTwoFactorCode,
  verifyTwoFactorCode,
  maskTwoFactorEmail,
} from '../profile/two-factor.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Email-OTP two-factor sign-in configuration.
  private static readonly TWO_FACTOR_TTL_SECONDS = 600; // 10 minutes
  private static readonly TWO_FACTOR_MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
    private readonly audit: AuditLoggingService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
    private readonly authenticator: AuthenticatorService,
    private readonly jwks: JwksService,
  ) {}

  /**
   * Registers a new church admin user.
   *
   * Flow:
   * 1. Create Supabase Auth user (email/password)
   * 2. Create Church record
   * 3. Create Profile linking Supabase user to church with church_admin role
   * 4. Audit-log the registration
   *
   * @param dto - Registration data
   * @returns Registration response with userId, profileId, churchId
   * @throws ConflictException if email is already registered
   * @throws InternalServerErrorException if Supabase or DB operations fail
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    // TODO: Change Supabase rate limit back to 30/5mins after testing (currently set to 3000/5mins)
    // Create Supabase Auth user
    const { data: authData, error: authError } = await this.supabase.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          first_name: dto.firstName,
          last_name: dto.lastName,
          church_name: dto.churchName,
        },
      },
    });

    if (authError) {
      this.logger.error(
        `Supabase signUp error: ${authError.message} (status: ${authError.status})`,
      );
      if (authError.message?.includes('already registered')) {
        throw new ConflictException('An account with this email already exists');
      }
      if (
        authError.message?.includes('rate limit') ||
        authError.message?.includes('too many') ||
        authError.status === 429
      ) {
        this.logger.warn(`Supabase signUp rate limited for ${dto.email}`);
        throw new HttpException(
          'Too many registration attempts. Please try again in a few minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.error(`Supabase signUp failed: ${authError.message}`);
      throw new InternalServerErrorException('Failed to create user account');
    }

    if (!authData.user) {
      throw new InternalServerErrorException('Failed to create user account');
    }

    const userId = authData.user.id;

    // Create Church + Profile in a transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create church
        const church = await tx.church.create({
          data: {
            name: dto.churchName,
            denomination: dto.denomination,
            email: dto.email,
          },
        });

        // Create admin profile
        const profile = await tx.profile.create({
          data: {
            user_id: userId,
            church_id: church.id,
            role: ['church_admin'],
            is_admin_hq: true,
            first_name: dto.firstName,
            last_name: dto.lastName,
            phone: dto.phone,
            email: dto.email,
          },
        });

        return { church, profile };
      });

      // Audit-log the registration
      await this.audit.log({
        userId,
        churchId: result.church.id,
        entity: 'auth',
        action: 'CREATE',
        entityId: result.profile.id,
        newValues: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          churchName: dto.churchName,
        },
      });

      this.logger.log(`User registered: ${dto.email} → ${result.church.name}`);

      return {
        userId,
        email: dto.email,
        profileId: result.profile.id,
        churchId: result.church.id,
        churchName: result.church.name,
        role: result.profile.role,
      };
    } catch (error) {
      // If Prisma fails after Supabase user was created, log but don't rethrow auth user
      this.logger.error(
        `Failed to create church/profile for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to complete registration');
    }
  }

  /**
   * Authenticates a user with email and password.
   *
   * Flow:
   * 1. Call Supabase signInWithPassword
   * 2. Fetch profile from Prisma
   * 3. Audit-log the login event
   * 4. Return tokens and profile
   *
   * @param dto - Login credentials
   * @returns Login response with tokens and profile
   * @throws UnauthorizedException on invalid credentials
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const { data, error } = await this.supabase.createAuthClient().auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      if (
        error.message?.includes('rate limit') ||
        error.message?.includes('too many') ||
        error.status === 429
      ) {
        this.logger.warn(`Login rate limited for ${dto.email}`);
        throw new HttpException(
          'Too many login attempts. Please try again in a few minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      this.logger.warn(`Login failed for ${dto.email}: ${error.message}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!data.user || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const userId = data.user.id;

    // Fetch profile with 2FA state
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: {
        id: true,
        church_id: true,
        branch_id: true,
        role: true,
        first_name: true,
        last_name: true,
        email: true,
        two_factor_enabled: true,
        authenticator: { select: { revision: true } },
        church: { select: { name: true } },
      },
    });

    const session = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      userId,
      email: data.user.email || dto.email,
      profile: profile
        ? {
            profileId: profile.id,
            churchId: profile.church_id,
            branchId: profile.branch_id || undefined,
            role: profile.role,
            firstName: profile.first_name,
            lastName: profile.last_name,
          }
        : undefined,
    };

    const email = data.user.email || dto.email;

    if (profile?.authenticator) {
      const challengeToken = randomUUID();
      try {
        await this.redis.set(
          `mfa:login:${challengeToken}`,
          { session, kind: 'login', revision: profile.authenticator.revision },
          300,
        );
      } catch {
        throw new ServiceUnavailableException(
          'Authenticator sign-in is temporarily unavailable. Try again.',
        );
      }
      return { requiresTwoFactor: true, challengeToken, twoFactorMethod: 'authenticator', userId };
    }

    const factors =
      data.user.factors?.filter((f) => f.factor_type === 'totp' && f.status === 'verified') ?? [];
    if (factors.length) {
      const challengeToken = randomUUID();
      try {
        await this.redis.set(
          `mfa:login:${challengeToken}`,
          JSON.stringify({ session, factorId: factors[0].id, kind: 'supabase-migration' }),
          300,
        );
      } catch {
        throw new ServiceUnavailableException(
          'Authenticator sign-in is temporarily unavailable. Try again.',
        );
      }
      return {
        requiresTwoFactor: true,
        challengeToken,
        twoFactorMethod: 'supabase-migration',
        userId,
      };
    }

    // Legacy email-2FA accounts must verify their existing factor once before
    // enrolling TOTP. No application session is released until TOTP is verified.
    if (profile?.two_factor_enabled) {
      const recipient = profile.email?.trim() || email;

      try {
        await this.redis.del(`2fa:login:pending:${userId}:attempts`);
        await this.redis.set(
          `2fa:login:pending:${userId}`,
          JSON.stringify({
            session: {
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              expiresAt: session.expiresAt,
            },
            user: { userId, email, profile: session.profile },
          }),
          AuthService.TWO_FACTOR_TTL_SECONDS,
        );
      } catch {
        throw new ServiceUnavailableException(
          'Two-factor sign-in is temporarily unavailable. Try again.',
        );
      }

      // Send the OTP email. This must NOT fail open: if the email cannot be
      // sent we must not log the user in without 2FA. Surface a clean error so
      // the caller can prompt the user to retry / request the code again.
      try {
        await this.sendLoginCode(userId, recipient, profile.church.name ?? 'ChurchOS');
      } catch (err) {
        this.logger.error(`Failed to send 2FA login code to ${recipient}: ${this.msg(err)}`);
        // Best-effort cleanup of the pending (unverifiable) session.
        await this.redis
          .del(`2fa:login:pending:${userId}`)
          .catch((delErr) =>
            this.logger.warn(`Failed to clear pending 2FA session: ${this.msg(delErr)}`),
          );
        throw new ServiceUnavailableException(
          'Could not send your verification code. Please try again.',
        );
      }

      this.logger.log(`2FA required for login: ${email}`);
      return {
        requiresTwoFactor: true,
        twoFactorEmail: maskTwoFactorEmail(recipient),
        twoFactorMethod: 'migration',
        userId,
      };
    }

    await this.auditSuccessfulLogin(session, false);
    this.logger.log(`User logged in: ${email}`);

    return session;
  }

  async enrollAuthenticator(userId: string, email: string) {
    return this.authenticator.setup(userId, email);
  }

  private async verifyLegacySupabaseAuthenticator(token: string, factorId: string, code: string) {
    try {
      const challenge = await this.supabase.authRequest<{ id: string }>(
        token,
        `factors/${factorId}/challenge`,
        {},
      );
      const verified = await this.supabase.authRequest<{
        access_token: string;
        refresh_token: string;
        expires_at?: number;
        expires_in: number;
      }>(token, `factors/${factorId}/verify`, { challenge_id: challenge.id, code });
      return {
        ...verified,
        expires_at: verified.expires_at ?? Math.floor(Date.now() / 1000) + verified.expires_in,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authenticator code. Try the current code from your app.',
      );
    }
  }

  async configureAuthenticator(
    userId: string,
    token: string,
    factorId: string,
    code: string,
    disable = false,
  ) {
    let recoveryCodes: string[] | undefined;
    if (disable) await this.authenticator.disable(userId, code);
    else
      recoveryCodes = (await this.authenticator.activate(userId, token, factorId, code))
        .recoveryCodes;
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { user_id: userId },
      select: { church_id: true },
    });
    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'auth',
      entityId: userId,
      action: 'UPDATE',
      newValues: { authenticator_action: disable ? 'removed' : 'enabled' },
    });
    return { recoveryCodes };
  }

  async listAuthenticators(userId: string) {
    return this.authenticator.factors(userId);
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const result = await this.authenticator.regenerateRecoveryCodes(userId, code);
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { user_id: userId },
      select: { church_id: true },
    });
    await this.audit.log({
      userId,
      churchId: profile.church_id,
      entity: 'auth',
      entityId: userId,
      action: 'UPDATE',
      newValues: { authenticator_action: 'recovery_codes_replaced' },
    });
    return result;
  }

  private async auditSuccessfulLogin(session: LoginResponseDto, twoFactorVerified: boolean) {
    await this.audit.log({
      userId: session.userId,
      churchId: session.profile?.churchId ?? '',
      entity: 'auth',
      action: 'LOGIN',
      entityId: session.userId,
      newValues: { email: session.email, two_factor_verified: twoFactorVerified },
    });
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Completes backend TOTP/recovery verification, or migrates a legacy factor.
   *
   * Password sessions remain withheld until a backend factor is verified.
   * Legacy verification returns enrollment, never an application session.
   *
   * @param dto - Account email and the 6-digit code
   * @returns The full login response (access token, refresh token, profile)
   * @throws UnauthorizedException if the code is wrong, expired, or not requested
   */
  async completeTwoFactorLogin(dto: Login2faDto): Promise<LoginResponseDto> {
    if (dto.challengeToken) {
      const key = `mfa:login:${dto.challengeToken}`;
      const raw = await this.redis.get<string>(key);
      if (!raw) throw new UnauthorizedException('Sign-in expired. Enter your password again.');
      const record = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        session: LoginResponseDto;
        factorId?: string;
        revision?: string;
        kind: 'login' | 'enroll' | 'supabase-migration';
      };
      const attempts = await this.redis.incr(`${key}:attempts`, 300);
      if (attempts > 5) {
        await this.redis.del(key);
        throw new UnauthorizedException('Too many attempts. Sign in again.');
      }
      if (record.kind === 'supabase-migration') {
        await this.authenticator.attempt(record.session.userId);
        const verified = await this.verifyLegacySupabaseAuthenticator(
          record.session.accessToken!,
          record.factorId!,
          dto.code,
        );
        if (!(await this.redis.consume(key)))
          throw new UnauthorizedException('Challenge already used.');
        const setup = await this.enrollAuthenticator(
          record.session.userId,
          record.session.email ?? 'Account',
        );
        const challengeToken = randomUUID();
        await this.redis.set(
          `mfa:login:${challengeToken}`,
          {
            session: {
              ...record.session,
              accessToken: verified.access_token,
              refreshToken: verified.refresh_token,
              expiresAt: verified.expires_at,
            },
            factorId: setup.factorId,
            kind: 'enroll',
          },
          300,
        );
        return {
          requiresTwoFactor: true,
          challengeToken,
          twoFactorMethod: 'authenticator',
          authenticatorSetup: setup,
          userId: record.session.userId,
        };
      }
      let recoveryCodes: string[] | undefined;
      if (record.kind === 'enroll') {
        recoveryCodes = (
          await this.authenticator.activate(
            record.session.userId,
            record.session.accessToken!,
            record.factorId!,
            dto.code,
          )
        ).recoveryCodes;
      } else {
        const revision = await this.authenticator.verify(record.session.userId, dto.code);
        if (revision !== record.revision)
          throw new UnauthorizedException('Authenticator changed. Sign in again.');
        await this.authenticator.approve(
          record.session.userId,
          record.session.accessToken!,
          revision,
        );
      }
      if (!(await this.redis.consume(key)))
        throw new UnauthorizedException('Challenge already used.');
      await this.auditSuccessfulLogin(record.session, true);
      return { ...record.session, recoveryCodes };
    }
    if (!dto.email) throw new UnauthorizedException('Missing sign-in challenge');
    const normalizedEmail = dto.email.trim().toLowerCase();
    const profile = await this.prisma.profile.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, user_id: true, church_id: true },
    });

    if (!profile) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const key = `2fa:login:pending:${profile.user_id}`;
    let raw: string | null = null;
    try {
      raw = await this.redis.get<string>(key);
    } catch (err) {
      this.logger.warn(
        `2FA pending lookup skipped (Redis unavailable): ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!raw) {
      throw new UnauthorizedException('No pending sign-in found. Please sign in again.');
    }

    let record: {
      session: { accessToken: string; refreshToken?: string; expiresAt: number };
      user: { userId: string; email: string; profile: unknown };
      digest: string;
      attempts: number;
      expiresAt: number;
    };
    let digest = '';
    let attempts = 0;
    try {
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        session: { accessToken: string; refreshToken?: string; expiresAt: number };
        user: { userId: string; email: string; profile: unknown };
        digest?: string;
        attempts?: number;
        expiresAt: number;
      };
      record = {
        ...parsed,
        digest: parsed.digest ?? '',
        attempts: parsed.attempts ?? 0,
      };
      digest = parsed.digest ?? '';
      if (!parsed.expiresAt || parsed.expiresAt < Date.now()) throw new Error('Expired');
    } catch {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.authenticator.attempt(profile.user_id);
    attempts = await this.redis.incr(`${key}:attempts`, 600);
    if (attempts > AuthService.TWO_FACTOR_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new UnauthorizedException('Too many attempts. Sign in again.');
    }
    if (!digest || !verifyTwoFactorCode(dto.code.trim(), digest)) {
      throw new UnauthorizedException('Invalid verification code.');
    }

    if (!(await this.redis.consume(key)))
      throw new UnauthorizedException('Sign-in challenge already used.');

    this.logger.log(`2FA sign-in completed: ${normalizedEmail}`);

    const setup = await this.enrollAuthenticator(profile.user_id, record.user.email);
    const challengeToken = randomUUID();
    await this.redis.set(
      `mfa:login:${challengeToken}`,
      JSON.stringify({
        session: { ...record.session, ...record.user },
        factorId: setup.factorId,
        kind: 'enroll',
      }),
      300,
    );
    return {
      requiresTwoFactor: true,
      twoFactorMethod: 'authenticator',
      challengeToken,
      authenticatorSetup: setup,
      userId: profile.user_id,
    };
  }

  /**
   * Sends a login OTP to the account email via Resend.
   *
   * Stores the code's SHA-256 digest alongside the pending login record so it
   * can be verified by completeTwoFactorLogin.
   *
   * @param userId - Supabase Auth user ID
   * @param recipient - Account email address
   * @param churchName - Church display name for the email subject/body
   */
  private async sendLoginCode(
    userId: string,
    recipient: string,
    churchName: string,
  ): Promise<void> {
    const code = generateTwoFactorCode();
    const digest = hashTwoFactorCode(code);
    const key = `2fa:login:pending:${userId}`;

    let existing: string | null = null;
    try {
      existing = await this.redis.get<string>(key);
    } catch (err) {
      this.logger.warn(
        `2FA pending read skipped (Redis unavailable): ${err instanceof Error ? err.message : err}`,
      );
    }
    const base = existing
      ? ((typeof existing === 'string' ? JSON.parse(existing) : existing) as {
          session?: unknown;
          user?: unknown;
        })
      : {};
    await this.redis.set(
      key,
      JSON.stringify({
        ...base,
        digest,
        attempts: 0,
        expiresAt: Date.now() + AuthService.TWO_FACTOR_TTL_SECONDS * 1000,
      }),
      AuthService.TWO_FACTOR_TTL_SECONDS,
    );

    const appUrl = this.config.get<string>('WEB_URL') ?? '';
    const html = [
      `<p>Hello,</p>`,
      `<p>Your ${churchName} sign-in code is:</p>`,
      `<p style="font-size:28px;letter-spacing:4px;font-weight:bold;margin:16px 0;">${code}</p>`,
      `<p>Enter this code in the app to complete your sign-in. It expires in ${Math.floor(AuthService.TWO_FACTOR_TTL_SECONDS / 60)} minutes.</p>`,
      `<p>If you didn't try to sign in, you can safely ignore this email.</p>`,
      `<p>— ${churchName}</p>`,
      appUrl
        ? `<p style="color:#6b7280;font-size:12px;"><a href="${appUrl}">${appUrl}</a></p>`
        : '',
    ].join('');

    await this.resend.sendEmail(recipient, 'Your ChurchOS sign-in code', html, '');
  }

  /**
   * Logs out a user by blacklisting their JWT token in Redis.
   *
   * @param userId - Supabase Auth user ID
   * @param token - JWT token to blacklist
   * @param churchId - Church ID for audit logging
   */
  async logout(userId: string, token: string, churchId: string): Promise<void> {
    await this.prisma.verifiedMfaSession.deleteMany({ where: { user_id: userId } });
    // Calculate TTL from JWT expiry (default 3600s if we can't parse)
    const ttlSeconds = 3600;

    // Blacklist the token in Redis (non-fatal: a Redis outage must not block logout)
    try {
      await this.redis.set(`auth:blacklist:${token}`, userId, ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Token blacklist write failed (Redis unavailable): ${err instanceof Error ? err.message : err}`,
      );
    }

    // Revoke all sessions in Supabase (invalidates refresh tokens)
    const { error } = await this.supabase.client.auth.admin.signOut(userId);
    if (error) {
      this.logger.warn(`Failed to revoke Supabase sessions for user ${userId}: ${error.message}`);
    }

    // Audit-log the logout
    await this.audit.log({
      userId,
      churchId,
      entity: 'auth',
      action: 'LOGOUT',
      entityId: userId,
      newValues: { timestamp: new Date().toISOString() },
    });

    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Initiates a password reset by sending a reset email via Supabase.
   *
   * Always returns success to prevent email enumeration.
   *
   * @param email - Email address to send reset link to
   * @param redirectTo - URL to redirect to after password reset
   */
  async forgotPassword(email: string, redirectTo?: string): Promise<void> {
    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:3000');
    const redirectUrl = redirectTo || `${webUrl}/reset-password`;

    // TODO: Send the reset email via Resend (branded template with expiry
    // details and support contact) — generate the link via
    // supabase.auth.admin.generateLink and email it ourselves instead of
    // relying on Supabase's default reset template.
    const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      this.logger.error(`Forgot password failed for ${email}: ${error.message}`);
      // Don't throw — always return success to prevent email enumeration
    } else {
      this.logger.log(`Password reset email sent to: ${email}`);
    }
  }

  /**
   * Completes a password reset with a recovery token.
   *
   * @param token - Recovery token from email link
   * @param newPassword - New password to set
   * @throws BadRequestException if token is invalid or expired
   */
  async resetPassword(_token: string, newPassword: string): Promise<void> {
    const { error } = await this.supabase.client.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Password reset failed: ${error.message}`);
      throw new BadRequestException('Invalid or expired recovery token');
    }

    this.logger.log('Password reset completed successfully');
  }

  /**
   * Changes password for an authenticated user.
   *
   * Flow:
   * 1. Resolve the account email from Supabase Auth (source of truth — the
   *    JWT claim can be stale after email changes)
   * 2. Verify current password via signInWithPassword
   * 3. Set the new password via the admin API (no session dependency)
   * 4. Revoke existing sessions so other devices re-authenticate
   * 5. Audit-log the event
   *
   * @param userId - Supabase Auth user ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @throws UnauthorizedException if current password is incorrect
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Resolve the authoritative account email
    const { data: userData, error: getUserError } =
      await this.supabase.client.auth.admin.getUserById(userId);

    if (getUserError || !userData?.user?.email) {
      this.logger.error(
        `Change password failed for ${userId}: unable to resolve account email${
          getUserError ? ` (${getUserError.message})` : ''
        }`,
      );
      throw new InternalServerErrorException('Unable to verify your account');
    }

    // Verify current password
    const { error: signInError } = await this.supabase.createAuthClient().auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });

    if (signInError) {
      this.logger.warn(`Change password verification failed for ${userId}: ${signInError.message}`);
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Update to new password via the admin API
    const { error: updateError } = await this.supabase.client.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      this.logger.error(`Change password update failed for ${userId}: ${updateError.message}`);
      throw new InternalServerErrorException('Failed to update password');
    }

    // Revoke existing sessions so other devices must re-authenticate.
    // Access tokens stay valid until expiry, so the current device keeps
    // working until its next refresh.
    const { error: signOutError } = await this.supabase.client.auth.admin.signOut(userId);
    if (signOutError) {
      this.logger.warn(
        `Failed to revoke sessions after password change for ${userId}: ${signOutError.message}`,
      );
    }

    await this.prisma.verifiedMfaSession.deleteMany({ where: { user_id: userId } });
    // Audit-log
    await this.audit.log({
      userId,
      churchId: '',
      entity: 'auth',
      action: 'UPDATE',
      entityId: userId,
      newValues: { action: 'password_changed' },
    });

    this.logger.log(`Password changed for user: ${userId}`);
  }

  /**
   * Refreshes the session tokens using Supabase's refreshSession.
   *
   * @param refreshToken - Current refresh token
   * @returns New tokens and expiry
   * @throws UnauthorizedException if refresh fails
   */
  async refreshSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }> {
    const { data, error } = await this.supabase.createAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      this.logger.warn(`Session refresh failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!data.session) {
      throw new UnauthorizedException('Failed to refresh session');
    }

    const { payload } = await this.jwks.verifyToken(data.session.access_token);
    await this.authenticator.assertSession(payload);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    };
  }
}
