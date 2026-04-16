import { pgTable, serial, text, boolean, timestamp, doublePrecision, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("developer"),
  isActive: boolean("is_active").notNull().default(true),
  creditBalance: doublePrecision("credit_balance").notNull().default(0),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: timestamp("email_verification_token_expires_at", { withTimezone: true }),
  passwordResetToken: text("password_reset_token"),
  passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at", { withTimezone: true }),
  creditWarningEmailSentAt: timestamp("credit_warning_email_sent_at", { withTimezone: true }),
  guardrailViolations: integer("guardrail_violations").notNull().default(0),
  guardrailSuspended: boolean("guardrail_suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("users_is_active_idx").on(table.isActive),
  index("users_role_idx").on(table.role),
  index("users_email_verification_token_idx").on(table.emailVerificationToken),
  index("users_password_reset_token_idx").on(table.passwordResetToken),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
