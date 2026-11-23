import { BadRequestException } from '@nestjs/common';

const DOMICILIO_PLATFORMS = new Set(['pistola', 'revolver']);

function caliberKey(caliber: string): string {
  return caliber
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, '')
    .replace(/[\s-]+/g, '');
}

function isCaliber380(caliber: string): boolean {
  const key = caliberKey(caliber);
  if (!key) {
    return false;
  }
  return (
    key === '380' ||
    key.startsWith('380acp') ||
    key === '9short' ||
    key === '9mmk' ||
    key === '9mmkurz' ||
    key === '9mmcorto'
  );
}

export function assertWeaponAssignment(modality: string, platform: string, caliber: string): void {
  if (modality === 'caceria' && caliber.trim() && isCaliber380(caliber)) {
    throw new BadRequestException('El calibre .380 ACP no está permitido para la modalidad Cacería.');
  }
  if (modality === 'proteccion-domicilio' && !DOMICILIO_PLATFORMS.has(platform)) {
    throw new BadRequestException('Protección de domicilio solo admite pistolas y revólveres.');
  }
}