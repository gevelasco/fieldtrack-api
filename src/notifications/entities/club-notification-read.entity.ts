import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';
import { ClubNotification } from './club-notification.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_notification_reads' })
export class ClubNotificationRead {
  @PrimaryColumn({ name: 'notification_id', type: 'int' })
  notificationId: number;

  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => ClubNotification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification: ClubNotification;

  @ManyToOne(() => AppUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: AppUser;

  @Column({ name: 'read_at', type: 'timestamptz', default: () => 'now()' })
  readAt: Date;
}
