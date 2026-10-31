import { and, asc, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateWhatsAppCampaignBody,
  CreateWhatsAppCampaignQueryParams,
  CreateWhatsAppCampaignResponse,
  GetWhatsAppCampaignsQueryParams,
  GetWhatsAppCampaignsResponse,
  GetWhatsAppTreatmentReminderAudienceQueryParams,
  GetWhatsAppTreatmentReminderAudienceResponse,
  MarkWhatsAppCampaignRecipientSentQueryParams,
  MarkWhatsAppCampaignRecipientSentResponse,
} from "@/lib/api-zod";
import {
  db,
  saleItemsTable,
  salonCustomersTable,
  salonServicesTable,
  salesTable,
  whatsappCampaignRecipientsTable,
  whatsappCampaignsTable,
} from "@/server/db";
import { getCashierSessionUser } from "../lib/cashier-session";

const router: IRouter = Router();
type SalonId = "beauty" | "hair-studio";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const HAIR_STUDIO_PROMO_CYCLE = 10;

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0062")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("8")) digits = `0${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function toCampaignResponse(
  campaign: typeof whatsappCampaignsTable.$inferSelect,
  recipients: (typeof whatsappCampaignRecipientsTable.$inferSelect)[],
) {
  return {
    id: campaign.id,
    salon: campaign.salon as SalonId,
    title: campaign.title,
    campaignType: campaign.campaignType as "campaign" | "treatment-reminder" | "hair-studio-bonus" | "points-redemption",
    message: campaign.message,
    createdBy: campaign.createdBy,
    createdAt: campaign.createdAt,
    recipientCount: recipients.length,
    sentCount: recipients.filter((recipient) => recipient.status === "sent").length,
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      phone: recipient.phone,
      customerName: recipient.customerName,
      status: recipient.status as "pending" | "sent",
      createdAt: recipient.createdAt,
      sentAt: recipient.sentAt,
      sentBy: recipient.sentBy,
    })),
  };
}

async function getHairStudioBonusAudience() {
  const [sales, services] = await Promise.all([
    db
      .select({
        id: salesTable.id,
        phone: salesTable.customerPhone,
      })
      .from(salesTable)
      .where(eq(salesTable.salon, "hair-studio")),
    db
      .select({
        id: salonServicesTable.id,
        category: salonServicesTable.category,
      })
      .from(salonServicesTable)
      .where(eq(salonServicesTable.salon, "hair-studio")),
  ]);
  const saleItems = sales.length
    ? await db
      .select({
        saleId: saleItemsTable.saleId,
        serviceId: saleItemsTable.serviceId,
      })
      .from(saleItemsTable)
      .where(inArray(saleItemsTable.saleId, sales.map((sale) => sale.id)))
    : [];
  const promoEligibleServiceIds = new Set(
    services
      .filter((service) => !["ADDITION", "ADDITIONAL"].includes(service.category.trim().toLocaleUpperCase("id")))
      .map((service) => service.id),
  );
  const qualifiedSaleIds = new Set(
    saleItems
      .filter((item) => promoEligibleServiceIds.has(item.serviceId))
      .map((item) => item.saleId),
  );
  const visitsByPhone = new Map<string, number>();

  for (const sale of sales) {
    if (!sale.phone || !qualifiedSaleIds.has(sale.id)) continue;
    const phone = normalizePhone(sale.phone);
    if (!phone) continue;
    visitsByPhone.set(phone, (visitsByPhone.get(phone) ?? 0) + 1);
  }

  return new Set(
    [...visitsByPhone]
      .filter(([, visits]) => visits % HAIR_STUDIO_PROMO_CYCLE >= 7)
      .map(([phone]) => phone),
  );
}

async function getTreatmentReminderAudience(salon: SalonId, now = new Date()) {
  const pendingCutoff = new Date(now.getTime() - TWO_WEEKS_MS);
  const [customers, sentReminders, recentPendingReminders] = await Promise.all([
    db
      .select({
        phone: salonCustomersTable.phone,
        name: salonCustomersTable.name,
        lastTreatmentAt: salonCustomersTable.lastTransactionAt,
      })
      .from(salonCustomersTable)
      .where(and(
        eq(salonCustomersTable.salon, salon),
        isNotNull(salonCustomersTable.lastTransactionAt),
      )),
    db
      .select({
        phone: whatsappCampaignRecipientsTable.phone,
        sentAt: whatsappCampaignRecipientsTable.sentAt,
      })
      .from(whatsappCampaignRecipientsTable)
      .innerJoin(whatsappCampaignsTable, eq(whatsappCampaignRecipientsTable.campaignId, whatsappCampaignsTable.id))
      .where(and(
        eq(whatsappCampaignRecipientsTable.salon, salon),
        eq(whatsappCampaignRecipientsTable.status, "sent"),
        eq(whatsappCampaignsTable.salon, salon),
        eq(whatsappCampaignsTable.campaignType, "treatment-reminder"),
      )),
    db
      .select({ phone: whatsappCampaignRecipientsTable.phone })
      .from(whatsappCampaignRecipientsTable)
      .innerJoin(whatsappCampaignsTable, eq(whatsappCampaignRecipientsTable.campaignId, whatsappCampaignsTable.id))
      .where(and(
        eq(whatsappCampaignRecipientsTable.salon, salon),
        eq(whatsappCampaignRecipientsTable.status, "pending"),
        eq(whatsappCampaignsTable.salon, salon),
        eq(whatsappCampaignsTable.campaignType, "treatment-reminder"),
        gt(whatsappCampaignsTable.createdAt, pendingCutoff),
      )),
  ]);

  const lastSentByPhone = new Map<string, Date>();
  for (const reminder of sentReminders) {
    if (!reminder.sentAt) continue;
    const existing = lastSentByPhone.get(reminder.phone);
    if (!existing || reminder.sentAt > existing) lastSentByPhone.set(reminder.phone, reminder.sentAt);
  }
  const pendingPhones = new Set(recentPendingReminders.map((reminder) => reminder.phone));

  return customers.flatMap((customer) => {
    const lastTreatmentAt = customer.lastTreatmentAt;
    if (!lastTreatmentAt || pendingPhones.has(customer.phone)) return [];

    const lastReminderSentAt = lastSentByPhone.get(customer.phone) ?? null;
    const lastRelevantAt = lastReminderSentAt && lastReminderSentAt > lastTreatmentAt
      ? lastReminderSentAt
      : lastTreatmentAt;
    const dueAt = new Date(lastRelevantAt.getTime() + TWO_WEEKS_MS);
    if (dueAt > now) return [];

    return [{
      salon,
      phone: customer.phone,
      name: customer.name,
      lastTreatmentAt,
      lastReminderSentAt,
      dueAt,
    }];
  }).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

router.get("/whatsapp-campaigns", async (req, res): Promise<void> => {
  const params = GetWhatsAppCampaignsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const campaigns = await db
    .select()
    .from(whatsappCampaignsTable)
    .where(eq(whatsappCampaignsTable.salon, params.data.salon))
    .orderBy(desc(whatsappCampaignsTable.createdAt))
    .limit(50);
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const recipients = campaignIds.length
    ? await db
      .select()
      .from(whatsappCampaignRecipientsTable)
      .where(and(
        eq(whatsappCampaignRecipientsTable.salon, params.data.salon),
        inArray(whatsappCampaignRecipientsTable.campaignId, campaignIds),
      ))
      .orderBy(asc(whatsappCampaignRecipientsTable.createdAt))
    : [];
  const recipientsByCampaign = new Map<string, typeof recipients>();
  for (const recipient of recipients) {
    const grouped = recipientsByCampaign.get(recipient.campaignId) ?? [];
    grouped.push(recipient);
    recipientsByCampaign.set(recipient.campaignId, grouped);
  }

  res.set("Cache-Control", "no-store");
  res.json(GetWhatsAppCampaignsResponse.parse(
    campaigns.map((campaign) => toCampaignResponse(
      campaign,
      recipientsByCampaign.get(campaign.id) ?? [],
    )),
  ));
});

router.post("/whatsapp-campaigns", async (req, res): Promise<void> => {
  const params = CreateWhatsAppCampaignQueryParams.safeParse(req.query);
  const body = CreateWhatsAppCampaignBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Judul, pesan, salon, dan pelanggan tujuan harus valid." });
    return;
  }

  const user = getCashierSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Silakan masuk ke web GGS." });
    return;
  }

  const title = body.data.title.trim();
  const message = body.data.message.trim();
  const recipientPhones = [...new Set(
    body.data.recipientPhones
      .map(normalizePhone)
      .filter((phone): phone is string => phone !== null),
  )];
  if (!title || !message || recipientPhones.length === 0 || recipientPhones.length > 500) {
    res.status(400).json({ error: "Judul, pesan, atau daftar pelanggan belum valid." });
    return;
  }

  if (body.data.campaignType === "treatment-reminder") {
    const dueAudience = await getTreatmentReminderAudience(params.data.salon);
    const duePhones = new Set(dueAudience.map((candidate) => normalizePhone(candidate.phone)).filter(Boolean));
    if (recipientPhones.some((phone) => !duePhones.has(phone))) {
      res.status(400).json({ error: "Sebagian pelanggan tidak lagi jatuh tempo untuk pengingat treatment. Muat ulang daftar." });
      return;
    }
  }
  if (body.data.campaignType === "hair-studio-bonus") {
    if (params.data.salon !== "hair-studio") {
      res.status(400).json({ error: "Pengingat bonus potong gratis hanya tersedia untuk GGS Hair Studio." });
      return;
    }
    const eligiblePhones = await getHairStudioBonusAudience();
    if (recipientPhones.some((phone) => !eligiblePhones.has(phone))) {
      res.status(400).json({ error: "Sebagian pelanggan belum memenuhi tahap pengingat bonus potong gratis. Muat ulang daftar." });
      return;
    }
  }

  const customers = await db
    .select({
      phone: salonCustomersTable.phone,
      name: salonCustomersTable.name,
        points: salonCustomersTable.points,
    })
    .from(salonCustomersTable)
    .where(and(
      eq(salonCustomersTable.salon, params.data.salon),
      inArray(salonCustomersTable.phone, recipientPhones),
    ));
  if (customers.length !== recipientPhones.length) {
    res.status(400).json({ error: "Sebagian pelanggan tidak ditemukan di salon ini. Muat ulang daftar pelanggan." });
    return;
  }
  if (body.data.campaignType === "points-redemption" && customers.some((customer) => customer.points <= 0)) {
    res.status(400).json({ error: "Sebagian pelanggan tidak memiliki saldo poin. Muat ulang daftar pelanggan." });
    return;
  }

  const campaign = await db.transaction(async (tx) => {
    const [createdCampaign] = await tx
      .insert(whatsappCampaignsTable)
      .values({
        salon: params.data.salon,
        title,
        campaignType: body.data.campaignType,
        message,
        createdBy: user.name,
      })
      .returning();
    const createdRecipients = await tx
      .insert(whatsappCampaignRecipientsTable)
      .values(customers.map((customer) => ({
        campaignId: createdCampaign.id,
        salon: params.data.salon,
        phone: customer.phone,
        customerName: customer.name,
      })))
      .returning();
    return toCampaignResponse(createdCampaign, createdRecipients);
  });

  req.log.info(
    { salon: params.data.salon, campaignId: campaign.id, campaignType: campaign.campaignType, recipientCount: campaign.recipientCount },
    "Created WhatsApp campaign.",
  );
  res.status(201).json(CreateWhatsAppCampaignResponse.parse(campaign));
});

router.get("/whatsapp-treatment-reminder-audience", async (req, res): Promise<void> => {
  const params = GetWhatsAppTreatmentReminderAudienceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const audience = await getTreatmentReminderAudience(params.data.salon);
  req.log.info({ salon: params.data.salon, count: audience.length }, "Fetched customers due for WhatsApp treatment reminders.");
  res.set("Cache-Control", "no-store");
  res.json(GetWhatsAppTreatmentReminderAudienceResponse.parse(audience));
});

router.patch("/whatsapp-campaign-recipients/sent", async (req, res): Promise<void> => {
  const params = MarkWhatsAppCampaignRecipientSentQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Kampanye dan penerima belum valid." });
    return;
  }

  const user = getCashierSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Silakan masuk ke web GGS." });
    return;
  }

  const whereRecipient = and(
    eq(whatsappCampaignRecipientsTable.id, params.data.recipientId),
    eq(whatsappCampaignRecipientsTable.campaignId, params.data.campaignId),
    eq(whatsappCampaignRecipientsTable.salon, params.data.salon),
  );
  const [existingRecipient] = await db
    .select()
    .from(whatsappCampaignRecipientsTable)
    .where(whereRecipient)
    .limit(1);
  if (!existingRecipient) {
    res.status(404).json({ error: "Penerima kampanye tidak ditemukan." });
    return;
  }

  const [recipient] = existingRecipient.status === "sent"
    ? [existingRecipient]
    : await db
      .update(whatsappCampaignRecipientsTable)
      .set({
        status: "sent",
        sentAt: new Date(),
        sentBy: user.name,
      })
      .where(and(whereRecipient, eq(whatsappCampaignRecipientsTable.status, "pending")))
      .returning();

  const result = recipient ?? (await db
    .select()
    .from(whatsappCampaignRecipientsTable)
    .where(whereRecipient)
    .limit(1))[0];
  if (!result) {
    res.status(404).json({ error: "Penerima kampanye tidak ditemukan." });
    return;
  }

  req.log.info(
    { salon: params.data.salon, campaignId: params.data.campaignId, recipientId: result.id, sentBy: result.sentBy },
    "Marked WhatsApp campaign recipient as sent.",
  );
  res.json(MarkWhatsAppCampaignRecipientSentResponse.parse({
    id: result.id,
    phone: result.phone,
    customerName: result.customerName,
    status: result.status as "pending" | "sent",
    createdAt: result.createdAt,
    sentAt: result.sentAt,
    sentBy: result.sentBy,
  }));
});

export default router;
