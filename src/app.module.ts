import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileModule } from './common/file/file.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { AuthModule } from './auth/auth.module';
import { ClubsModule } from './clubs/clubs.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ChecklistModule } from './checklist/checklist.module';
import { EventsModule } from './events/events.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { RecaudacionModule } from './recaudacion/recaudacion.module';
import { HuntingModule } from './hunting/hunting.module';
import { MembersModule } from './members/members.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RequestsModule } from './requests/requests.module';
import { SessionModule } from './session/session.module';
import { typeOrmEntityGlobsFromDir } from './database/typeorm-entity-globs';
import { typeOrmMigrationGlobsFromDir } from './database/typeorm-migration-globs';
import EnvConfig from './types/env-config.type';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    ObservabilityModule,
    FileModule,
    AuthModule,
    ClubsModule,
    SessionModule,
    ChecklistModule,
    NotificationsModule,
    MembersModule,
    RequestsModule,
    EventsModule,
    HuntingModule,
    CompetitionsModule,
    RecaudacionModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig>) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', { infer: true }),
        port: configService.get('DB_PORT', { infer: true }),
        username: configService.get('DB_USERNAME', { infer: true }),
        password: configService.get('DB_PASSWORD', { infer: true }),
        database: configService.get('DB_DATABASE', { infer: true }),
        entities: typeOrmEntityGlobsFromDir(__dirname),
        migrations: typeOrmMigrationGlobsFromDir(__dirname),
        migrationsTableName: 'migrations_list',
        migrationsTransactionMode: 'each',
        migrationsRun: false,
        autoLoadEntities: true,
        ssl:
          configService.get('DB_SSL', { infer: true }) === 'true'
            ? { rejectUnauthorized: false }
            : false,
        synchronize: false,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
