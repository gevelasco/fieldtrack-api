import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public/public.decorator';
import { AuthPayload } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'OPTIONS') {
      return true;
    }
    const token = bearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Inicia sesión.');
    }
    try {
      request.user = this.jwt.verify<AuthPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('La sesión expiró. Inicia sesión de nuevo.');
    }
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}
