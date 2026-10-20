import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcrypt';
import { Repository } from 'typeorm';
import { hashPassword } from '../common/hash-password';
import { Club } from '../clubs/entities/club.entity';
import EnvConfig from '../types/env-config.type';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { AuthPayload, AuthUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ActivationCode } from './entities/activation-code.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(UserPreferences) private readonly preferences: Repository<UserPreferences>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig>,
  ) {}

  async login(dto: LoginDto) {
    const identifier = dto.usuario.trim().toLowerCase();
    const candidates = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.status = :status', { status: 'active' })
      .andWhere('(LOWER(user.username) = :identifier OR LOWER(user.email) = :identifier)', {
        identifier,
      })
      .getMany();

    const matched: AppUser[] = [];
    for (const user of candidates) {
      if (user.passwordHash && (await compare(dto.password, user.passwordHash))) {
        matched.push(user);
      }
    }
    if (matched.length !== 1) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }

    return await this.issue(matched[0]);
  }

  async signUp(dto: SignUpDto) {
    const email = dto.correo.trim().toLowerCase();
    const name = dto.nombre.trim();
    const phone = normalizePhone(dto.telefono);
    const inviteCode = dto.codigoInvitacion.trim().toUpperCase();
    const clubName = dto.club.trim();

    const taken = await this.users
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
    if (taken) {
      throw new ConflictException('Ese correo ya tiene una cuenta. Inicia sesión.');
    }

    const rounds = Number(this.config.get('SALT_ROUNDS', { infer: true }) ?? 10);
    const passwordHash = await hashPassword(dto.password, Number.isFinite(rounds) && rounds > 0 ? rounds : 10);

    const user = await this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(AppUser);
      const clubs = manager.getRepository(Club);
      const codes = manager.getRepository(ActivationCode);

      const code = await codes
        .createQueryBuilder('code')
        .setLock('pessimistic_write')
        .where('UPPER(code.code) = :code', { code: inviteCode })
        .getOne();
      if (!code || !code.isActive || code.usedCount >= code.maxUses) {
        throw new BadRequestException('El código de invitación no es válido.');
      }

      const exists = await clubs
        .createQueryBuilder('club')
        .where('LOWER(club.name) = :name', { name: clubName.toLowerCase() })
        .getOne();
      if (exists) {
        throw new ConflictException('Ese club ya existe. Elige otro nombre.');
      }

      const club = await clubs.save(clubs.create({ name: clubName }));
      const username = await uniqueUsername(users, club.id, email);
      const created = await users.save(
        users.create({
          clubId: club.id,
          username,
          displayName: name,
          email,
          phone,
          passwordHash,
          role: 'admin',
          status: 'active',
        }),
      );

      code.usedCount += 1;
      code.redeemedAt = new Date();
      code.redeemedByClubId = club.id;
      code.redeemedByUserId = created.id;
      await codes.save(code);
      await manager.getRepository(UserPreferences).save({ userId: created.id, themeScheme: 'light' });
      return created;
    });

    return await this.issue(user);
  }

  async changePassword(userId: number, currentPassword: string, password: string): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .andWhere('user.status = :status', { status: 'active' })
      .getOne();
    if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('La contraseña actual no coincide.');
    }
    if (currentPassword === password) {
      throw new BadRequestException('Elige una contraseña distinta a la actual.');
    }
    const rounds = Number(this.config.get('SALT_ROUNDS', { infer: true }) ?? 10);
    const passwordHash = await hashPassword(password, Number.isFinite(rounds) && rounds > 0 ? rounds : 10);
    await this.users.update({ id: userId }, { passwordHash });
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: number };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('La sesión expiró. Inicia sesión de nuevo.');
    }

    const user = await this.users.findOne({
      where: { id: payload.sub, status: 'active' },
    });
    if (!user) {
      throw new UnauthorizedException('La sesión expiró. Inicia sesión de nuevo.');
    }
    return await this.issue(user);
  }

  private async issue(user: AppUser) {
    const prefs = await this.preferences.findOne({ where: { userId: user.id } });
    const theme = prefs?.themeScheme === 'dark' ? 'dark' : 'light';
    const authUser = mapAuthUser(user, theme);
    const payload: AuthPayload = {
      sub: user.id,
      clubId: user.clubId,
      role: user.role,
      username: user.username,
    };
    return {
      access_token: this.jwt.sign(payload, { expiresIn: '2d' }),
      refresh_token: this.jwt.sign(
        { sub: user.id },
        {
          secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
          expiresIn: '7d',
        },
      ),
      user: authUser,
    };
  }
}

async function uniqueUsername(
  users: Repository<AppUser>,
  clubId: number,
  email: string,
): Promise<string> {
  const base =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40) || 'socio';
  let candidate = base;
  let n = 1;
  while (await users.findOne({ where: { clubId, username: candidate } })) {
    n += 1;
    candidate = `${base.slice(0, 36)}${n}`;
  }
  return candidate;
}

function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10) {
    throw new BadRequestException('Escribe un teléfono de 10 dígitos.');
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function mapAuthUser(user: AppUser, theme: 'light' | 'dark'): AuthUser {
  return {
    id: user.id,
    clubId: user.clubId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photoDataUrl: user.photoDataUrl,
    theme,
  };
}
