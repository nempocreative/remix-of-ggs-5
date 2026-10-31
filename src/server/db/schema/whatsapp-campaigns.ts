import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const whatsappCampaignsTable = pgTable(
  "pos_whatsapp_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salon: text("salon").notNull(),
    title: text("title").notNull(),
    campaignType: text("campaign_type").notNull().default("campaign"),
    message: text("message").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pos_whatsapp_campaigns_salon_created_at_idx").on(table.salon, table.createdAt)],
);

export const whatsappCampaignRecipientsTable = pgTable(
  "pos_whatsapp_campaign_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => whatsappCampaignsTable.id, { onDelete: "cascade" }),
    salon: text("salon").notNull(),
    phone: text("phone").notNull(),
    customerName: text("customer_name").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentBy: text("sent_by"),
  },
  (table) => [
    uniqueIndex("pos_whatsapp_campaign_recipients_campaign_phone_uidx").on(table.campaignId, table.phone),
    index("pos_whatsapp_campaign_recipients_campaign_status_idx").on(table.campaignId, table.status),
    index("pos_whatsapp_campaign_recipients_salon_phone_idx").on(table.salon, table.phone),
  ],
);

export type WhatsAppCampaign = typeof whatsappCampaignsTable.$inferSelect;
export type InsertWhatsAppCampaign = typeof whatsappCampaignsTable.$inferInsert;
export type WhatsAppCampaignRecipient = typeof whatsappCampaignRecipientsTable.$inferSelect;
export type InsertWhatsAppCampaignRecipient = typeof whatsappCampaignRecipientsTable.$inferInsert;
