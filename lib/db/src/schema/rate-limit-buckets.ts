import { pgTable, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokens: doublePrecision("tokens").notNull(),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
