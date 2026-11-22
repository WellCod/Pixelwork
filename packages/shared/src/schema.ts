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
  (t) => [
    check('users_display_name_length', sql`char_length(${t.displayName}) between 1 and 40`),
    // Job horário de limpeza de convidados.
    index('users_guest_expires_at_idx').on(t.guestExpiresAt).where(sql`${t.isGuest}`),
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
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    // Cascata ao apagar usuário.
    index('oauth_accounts_user_id_idx').on(t.userId),
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
  (t) => [
    // Cascata ao apagar convidado e job de sessões vencidas.
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
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
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    check('org_members_role', sql`${t.role} in ('owner', 'admin')`),
    // A PK começa por org_id; GET /spaces procura pelo usuário.
    index('org_members_user_id_idx').on(t.userId),
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
  },
  (t) => [unique('spaces_org_slug').on(t.orgId, t.slug)],
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
  (t) => [
    primaryKey({ columns: [t.spaceId, t.userId] }),
    check('space_members_role', sql`${t.role} in ('admin', 'member')`),
    check('space_members_title_length', sql`char_length(${t.title}) <= 40`),
    check('space_members_status', sql`${t.status} in ('available', 'focus', 'away')`),
    check('space_members_status_text_length', sql`char_length(${t.statusText}) <= 80`),
    // Um grafema de emoji tem até uns 11 code points (família, bandeira com modificadores).
    check('space_members_status_emoji_length', sql`char_length(${t.statusEmoji}) <= 16`),
    // A PK começa por space_id; a lista de coworkings do usuário e a cascata procuram por user_id.
    index('space_members_user_id_idx').on(t.userId),
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
  (t) => [
    primaryKey({ columns: [t.spaceId, t.deskKey] }),
    unique('desk_assignments_space_user').on(t.spaceId, t.userId),
    // FK composta: sair do coworking libera a mesa automaticamente.
    foreignKey({
      name: 'desk_assignments_member_fk',
      columns: [t.spaceId, t.userId],
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
  (t) => [
    check('invites_role', sql`${t.role} in ('admin', 'member')`),
    check('invites_uses_left', sql`${t.usesLeft} is null or ${t.usesLeft} >= 0`),
    index('invites_space_id_idx').on(t.spaceId),
  ],
);
