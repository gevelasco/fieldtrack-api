import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, MoreThanOrEqual, Repository } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../common/constants/schema-name';
import { Member } from '../members/entities/member.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { ClubNotification } from './entities/club-notification.entity';
import { ClubNotificationRead } from './entities/club-notification-read.entity';

const NOTIFICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Eventos de solicitud que el socio no debe ver (operación interna o acción propia). */
const MEMBER_REQUEST_KINDS_HIDDEN = ['request_member_submitted', 'request_removed'] as const;

export type NotificationCategory = 'registration' | 'confirmation' | 'update' | 'reversal';

export interface NotificationDraft {
  clubId: number;
  kind: string;
  category: NotificationCategory;
  title: string;
  detail: string;
  entityType?: string | null;
  entityId?: string | null;
  actorUserId: number;
  actorLabel: string;
  occurredAt?: Date;
  dedupeKey?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(ClubNotification)
    private readonly notifications: Repository<ClubNotification>,
    @InjectRepository(ClubNotificationRead)
    private readonly reads: Repository<ClubNotificationRead>,
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
  ) {}

  async unreadCount(clubId: number, user: AppUser): Promise<number> {
    if (!notificationsEnabled(user)) {
      return 0;
    }
    const visibleSince = notificationVisibleSince(user);
    const builder = this.notifications
      .createQueryBuilder('n')
      .where('n.clubId = :clubId', { clubId })
      .andWhere('n.occurredAt >= :visibleSince', { visibleSince })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM ${FIELDTRACK_SCHEMA}.club_notification_reads r
          WHERE r.notification_id = n.id AND r.user_id = :userId
        )`,
        { userId: user.id },
      );
    await this.applyAudienceFilter(builder, clubId, user);
    return builder.getCount();
  }

  async list(clubId: number, user: AppUser) {
    if (!notificationsEnabled(user)) {
      return [];
    }
    const visibleSince = notificationVisibleSince(user);
    const builder = this.notifications
      .createQueryBuilder('n')
      .where('n.clubId = :clubId', { clubId })
      .andWhere('n.occurredAt >= :visibleSince', { visibleSince })
      .orderBy('n.occurredAt', 'DESC')
      .addOrderBy('n.id', 'DESC');
    await this.applyAudienceFilter(builder, clubId, user);
    const items = await builder.getMany();
    const reads = await this.reads.find({ where: { userId: user.id } });
    const readIds = new Set(reads.map((item) => item.notificationId));
    return items.map((item) => mapNotification(item, readIds.has(item.id)));
  }

  async markRead(clubId: number, user: AppUser): Promise<void> {
    if (!notificationsEnabled(user)) {
      return;
    }
    const visibleSince = notificationVisibleSince(user);
    const builder = this.notifications
      .createQueryBuilder('n')
      .where('n.clubId = :clubId', { clubId })
      .andWhere('n.occurredAt >= :visibleSince', { visibleSince });
    await this.applyAudienceFilter(builder, clubId, user);
    const items = await builder.select(['n.id']).getMany();
    if (items.length === 0) {
      return;
    }
    await this.reads
      .createQueryBuilder()
      .insert()
      .into(ClubNotificationRead)
      .values(
        items.map((item) => ({
          notificationId: item.id,
          userId: user.id,
          readAt: new Date(),
        })),
      )
      .orIgnore()
      .execute();
  }

  async record(draft: NotificationDraft): Promise<void> {
    try {
      await this.notifications.insert({
        clubId: draft.clubId,
        kind: draft.kind,
        category: draft.category,
        title: draft.title,
        detail: draft.detail,
        entityType: draft.entityType ?? null,
        entityId: draft.entityId ?? null,
        actorUserId: draft.actorUserId,
        actorLabel: draft.actorLabel,
        occurredAt: draft.occurredAt ?? new Date(),
        dedupeKey: draft.dedupeKey ?? null,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  private async applyAudienceFilter(
    builder: ReturnType<Repository<ClubNotification>['createQueryBuilder']>,
    clubId: number,
    user: AppUser,
  ): Promise<void> {
    if (user.role === 'admin' || user.role === 'staff') {
      return;
    }
    if (user.role !== 'socio') {
      builder.andWhere('1 = 0');
      return;
    }
    const member = await this.members.findOne({
      where: { clubId, userId: user.id },
      select: { id: true },
    });
    if (!member) {
      builder.andWhere('1 = 0');
      return;
    }
    const memberId = member.id;
    const memberKey = String(memberId);
    builder.andWhere(
      new Brackets((scope) => {
        scope
          .where(`n.entity_type = 'member' AND n.entity_id = :memberKey`, { memberKey })
          .orWhere(
            new Brackets((requests) => {
              requests
                .where(`n.entity_type = 'club_request'`)
                .andWhere('n.kind NOT IN (:...hiddenKinds)', {
                  hiddenKinds: [...MEMBER_REQUEST_KINDS_HIDDEN],
                })
                .andWhere(
                  `EXISTS (
                    SELECT 1 FROM ${FIELDTRACK_SCHEMA}.club_requests r
                    WHERE r.club_id = :clubId
                      AND r.member_id = :memberId
                      AND r.kind = 'member'
                      AND r.removed_at IS NULL
                      AND r.id = (n.entity_id)::int
                  )`,
                  { clubId, memberId },
                );
            }),
          )
          .orWhere(
            new Brackets((payments) => {
              payments
                .where(`n.entity_type = 'membership_payment'`)
                .andWhere(
                  `EXISTS (
                    SELECT 1 FROM ${FIELDTRACK_SCHEMA}.membership_payments p
                    WHERE p.club_id = :clubId
                      AND p.member_id = :memberId
                      AND p.id = (n.entity_id)::int
                  )`,
                  { clubId, memberId },
                );
            }),
          );
      }),
    );
  }
}

function mapNotification(item: ClubNotification, read: boolean) {
  return {
    id: item.id,
    clubId: item.clubId,
    kind: item.kind,
    category: item.category,
    title: item.title,
    detail: item.detail,
    occurredOn: item.occurredAt.toISOString(),
    read,
    actorLabel: item.actorLabel,
    entityType: item.entityType,
    entityId: item.entityId,
  };
}

/** Campana y listado para staff y socios (el alcance se filtra por rol). */
export function notificationsEnabled(user: AppUser): boolean {
  return user.role === 'admin' || user.role === 'staff' || user.role === 'socio';
}

/** Sondeo periódico del contador sin leer (solo operaciones). */
export function staffNotificationsEnabled(user: AppUser): boolean {
  return user.role === 'admin' || user.role === 'staff';
}

/** Notificaciones visibles: últimos 30 días; staff solo desde su alta en el club. */
export function notificationVisibleSince(user: AppUser): Date {
  const rolling = new Date(Date.now() - NOTIFICATION_WINDOW_MS);
  if (user.role !== 'staff') {
    return rolling;
  }
  const createdAt = user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt);
  return createdAt > rolling ? createdAt : rolling;
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; driverError?: { code?: string } })?.driverError?.code
    ?? (error as { code?: string })?.code;
  return code === '23505';
}
