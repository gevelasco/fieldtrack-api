import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Club } from '../../clubs/entities/club.entity';
import { CompetitionRegistration } from '../../competitions/entities/competition-registration.entity';
import { HuntingTagSale } from '../../hunting/entities/hunting-tag-sale.entity';
import { AppUser } from '../../users/entities/app-user.entity';
import { MemberDocument } from './member-document.entity';
import { MemberPeta } from './member-peta.entity';
import { MemberWeapon } from './member-weapon.entity';
import { MembershipPayment } from './membership-payment.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'members' })
export class Member {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club: Club;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'user_id' })
  user: AppUser | null;

  @Column({ name: 'member_number', type: 'text' })
  memberNumber: string;

  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'paternal_surname', type: 'text' })
  paternalSurname: string;

  @Column({ name: 'maternal_surname', type: 'text', default: '' })
  maternalSurname: string;

  @Column({ type: 'text', default: '' })
  email: string;

  @Column({ type: 'text', default: '' })
  phone: string;

  @Column({ name: 'joined_on', type: 'date' })
  joinedOn: string;

  @Column({ type: 'text' })
  sex: string;

  @Column({ type: 'text' })
  membership: string;

  @Column({ type: 'text', default: 'vigente' })
  status: string;

  @OneToMany(() => MemberDocument, (document) => document.member)
  documents: MemberDocument[];

  @OneToMany(() => MemberWeapon, (weapon) => weapon.member)
  weapons: MemberWeapon[];

  @OneToMany(() => MemberPeta, (peta) => peta.member)
  petas: MemberPeta[];

  @OneToMany(() => MembershipPayment, (payment) => payment.member)
  payments: MembershipPayment[];

  @OneToMany(() => HuntingTagSale, (sale) => sale.member)
  huntingTags: HuntingTagSale[];

  @OneToMany(() => CompetitionRegistration, (registration) => registration.member)
  competitionRegistrations: CompetitionRegistration[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
