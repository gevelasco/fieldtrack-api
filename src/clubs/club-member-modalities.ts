import { BadRequestException } from '@nestjs/common';
import { MembershipTypeRow } from './club-membership-types';

/**
 * Identificadores estables de modalidad de socio. Coinciden con los calendarios del club
 * (`sportShooting` / `hunting` en configuración). Los nombres y periodos son dinámicos;
 * estos slugs son la clave persistida en `members.modality`.
 */
export const CLUB_MEMBERSHIP_MODALITIES = ['tiro-deportivo', 'caza'] as const;

export type MembershipModalityId = (typeof CLUB_MEMBERSHIP_MODALITIES)[number];

export type MembershipModality = MembershipModalityId;

export const MEMBERSHIP_MODALITY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isMembershipModalityId(value: string): value is MembershipModalityId {
  return (CLUB_MEMBERSHIP_MODALITIES as readonly string[]).includes(value);
}

/** Modalidades que al menos un plan del club permite hoy. */
export function modalitiesEnabledInPlans(types: readonly MembershipTypeRow[]): MembershipModalityId[] {
  const out: MembershipModalityId[] = [];
  if (types.some((plan) => plan.allowsSportShooting)) {
    out.push('tiro-deportivo');
  }
  if (types.some((plan) => plan.allowsHunting)) {
    out.push('caza');
  }
  return out;
}

export function assertMembershipModalitySlug(modality: string): MembershipModalityId {
  if (!MEMBERSHIP_MODALITY_SLUG.test(modality)) {
    throw new BadRequestException('Modalidad inválida.');
  }
  if (!isMembershipModalityId(modality)) {
    throw new BadRequestException('La modalidad no corresponde a una modalidad configurada del club.');
  }
  return modality;
}

export function assertModalityEnabledForClub(
  types: readonly MembershipTypeRow[],
  modality: string,
): MembershipModalityId {
  const id = assertMembershipModalitySlug(modality);
  const enabled = modalitiesEnabledInPlans(types);
  if (!enabled.includes(id)) {
    throw new BadRequestException('Esa modalidad no está habilitada en los planes de membresía del club.');
  }
  return id;
}