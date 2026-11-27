import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// O drizzle-orm 0.45 não tem coluna bytea.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    displayName: text('display_name').notNull(),
    avatar: jsonb('avatar').notNull(),
    isGuest: boolean('is_guest').notNull().default(false),
    guestExpiresAt: timestamp('guest_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('users_display_name_length', sql`char_length(${table.displayName}) between 1 and 40`),
    // Job horário de limpeza de convidados.
    index('users_guest_expires_at_idx').on(table.guestExpiresAt).where(sql`${table.isGuest}`),
  ],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerUserId] }),
    // Cascata ao apagar usuário.
    index('oauth_accounts_user_id_idx').on(table.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    // Só o hash: vazar o banco não permite sequestrar sessões.
    tokenHash: bytea('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Cascata ao apagar convidado e job de sessões vencidas.
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orgId, table.userId] }),
    check('org_members_role', sql`${table.role} in ('owner', 'admin')`),
    // A PK começa por org_id; GET /spaces procura pelo usuário.
    index('org_members_user_id_idx').on(table.userId),
  ],
);

export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    map: jsonb('map').notNull(),
    mapVersion: integer('map_version').notNull().default(1),
    receptionEnabled: boolean('reception_enabled').notNull().default(false),
  },
  (table) => [unique('spaces_org_slug').on(table.orgId, table.slug)],
);

export const spaceMapVersions = pgTable(
  'space_map_versions',
  {
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    map: jsonb('map').notNull(),
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.version] })],
);

export const receptionDailyUsage = pgTable(
  'reception_daily_usage',
  {
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    reservedMs: integer('reserved_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.day] })],
);

export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    title: text('title'),
    status: text('status', { enum: ['available', 'focus', 'away'] })
      .notNull()
      .default('available'),
    statusText: text('status_text'),
    statusEmoji: text('status_emoji'),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.userId] }),
    check('space_members_role', sql`${table.role} in ('admin', 'member')`),
    check('space_members_title_length', sql`char_length(${table.title}) <= 40`),
    check('space_members_status', sql`${table.status} in ('available', 'focus', 'away')`),
    check('space_members_status_text_length', sql`char_length(${table.statusText}) <= 80`),
    // Um grafema de emoji tem até uns 11 code points (família, bandeira com modificadores).
    check('space_members_status_emoji_length', sql`char_length(${table.statusEmoji}) <= 16`),
    // A PK começa por space_id; a lista de coworkings do usuário e a cascata procuram por user_id.
    index('space_members_user_id_idx').on(table.userId),
  ],
);

export const deskAssignments = pgTable(
  'desk_assignments',
  {
    spaceId: uuid('space_id').notNull(),
    // Id estável do objeto "desk" no mapa.
    deskKey: text('desk_key').notNull(),
    userId: uuid('user_id').notNull(),
    decor: jsonb('decor').notNull().default({}),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.deskKey] }),
    unique('desk_assignments_space_user').on(table.spaceId, table.userId),
    // FK composta: sair do coworking libera a mesa automaticamente.
    foreignKey({
      name: 'desk_assignments_member_fk',
      columns: [table.spaceId, table.userId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.userId],
    }).onDelete('cascade'),
  ],
);

export const invites = pgTable(
  'invites',
  {
    tokenHash: bytea('token_hash').primaryKey(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usesLeft: integer('uses_left'),
  },
  (table) => [
    check('invites_role', sql`${table.role} in ('admin', 'member')`),
    check('invites_uses_left', sql`${table.usesLeft} is null or ${table.usesLeft} >= 0`),
    index('invites_space_id_idx').on(table.spaceId),
  ],
);
