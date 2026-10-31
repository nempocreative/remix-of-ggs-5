import { and, asc, eq, max } from "drizzle-orm";
import { db, salonServicesTable } from "@/server/db";
import { defaultSalonServices, legacyHairStudioServiceNames, type SalonId } from "./default-services";

export async function getSalonServices(salon: SalonId) {
  const existingServices = await db
    .select({ id: salonServicesTable.id, name: salonServicesTable.name })
    .from(salonServicesTable)
    .where(eq(salonServicesTable.salon, salon));

  if (salon === "hair-studio") {
    for (const service of existingServices) {
      const previousName = legacyHairStudioServiceNames[service.id];
      if (service.name !== previousName) continue;

      const updatedDefault = defaultSalonServices.find((item) => item.salon === salon && item.id === service.id);
      if (!updatedDefault) continue;

      await db
        .update(salonServicesTable)
        .set({
          name: updatedDefault.name,
          category: updatedDefault.category,
          sortOrder: updatedDefault.sortOrder,
          minPrice: updatedDefault.minPrice,
          maxPrice: updatedDefault.maxPrice,
          priceType: updatedDefault.priceType,
        })
        .where(and(
          eq(salonServicesTable.salon, salon),
          eq(salonServicesTable.id, service.id),
          eq(salonServicesTable.name, previousName),
        ));
    }
  }

  const existingIds = new Set(existingServices.map((service) => service.id));
  const missingDefaults = defaultSalonServices.filter(
    (service) => service.salon === salon && !existingIds.has(service.id),
  );

  if (missingDefaults.length) {
    await db.insert(salonServicesTable).values(missingDefaults).onConflictDoNothing();
  }

  const [sortState] = await db
    .select({ maxSortOrder: max(salonServicesTable.sortOrder) })
    .from(salonServicesTable)
    .where(eq(salonServicesTable.salon, salon));
  if ((sortState?.maxSortOrder ?? 0) === 0) {
    const defaults = defaultSalonServices.filter((service) => service.salon === salon);
    await Promise.all(defaults.map((service) =>
      db
        .update(salonServicesTable)
        .set({ sortOrder: service.sortOrder })
        .where(and(
          eq(salonServicesTable.salon, salon),
          eq(salonServicesTable.id, service.id),
          eq(salonServicesTable.sortOrder, 0),
        )),
    ));
  }

  return db
    .select()
    .from(salonServicesTable)
    .where(eq(salonServicesTable.salon, salon))
    .orderBy(asc(salonServicesTable.sortOrder));
}
