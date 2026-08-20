/**
 * Beispieldaten zum Ausprobieren.
 *
 *   npm run db:seed
 *
 * Das Skript legt nichts doppelt an: existiert bereits ein Objekt, bricht es ab.
 * Es ersetzt nicht die Einrichtung – der Admin-Zugang entsteht beim ersten
 * Login aus ADMIN_EMAIL / ADMIN_PASSWORD.
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function token(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function daysAgo(days: number): Date {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - days));
}

async function main() {
  const existing = await prisma.property.count();
  if (existing > 0) {
    console.log("Es sind bereits Objekte vorhanden – Seed wird übersprungen.");
    return;
  }

  const settings: Array<[string, string]> = [
    ["companyName", "Wohnwerk Unterkünfte GmbH"],
    ["companyStreet", "Hafenstraße 12"],
    ["companyZip", "28217"],
    ["companyCity", "Bremen"],
    ["companyEmail", "verwaltung@wohnwerk.example"],
    ["companyPhone", "0421 1234567"],
    ["bankName", "Sparkasse Bremen"],
    ["bankIban", "DE02120300000000202051"],
    ["bankBic", "BRLADE21BRE"],
  ];
  for (const [key, value] of settings) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  const hafen = await prisma.property.create({
    data: {
      name: "Monteurhaus Hafenstraße",
      street: "Hafenstraße 12",
      zip: "28217",
      city: "Bremen",
      shortCode: "HAF",
      managerName: "Kai Berger",
      managerPhone: "0170 1234567",
      wifiSsid: "Wohnwerk-Hafen",
      wifiPassword: "monteur2026",
      rooms: {
        create: [
          {
            name: "Zimmer 1",
            floor: "EG",
            sizeSqm: 18,
            sortOrder: 1,
            defaultBedRentCents: 35000,
            beds: {
              create: [
                { label: "Bett A", monthlyRentCents: 35000, sortOrder: 0 },
                { label: "Bett B", monthlyRentCents: 35000, sortOrder: 1 },
              ],
            },
          },
          {
            name: "Zimmer 2",
            floor: "EG",
            sizeSqm: 22,
            sortOrder: 2,
            defaultBedRentCents: 35000,
            beds: {
              create: [
                { label: "Bett A", monthlyRentCents: 35000, sortOrder: 0 },
                { label: "Bett B", monthlyRentCents: 35000, sortOrder: 1 },
                { label: "Bett C", monthlyRentCents: 32000, sortOrder: 2 },
              ],
            },
          },
          {
            name: "Zimmer 3",
            floor: "1. OG",
            sizeSqm: 16,
            sortOrder: 3,
            defaultBedRentCents: 39000,
            beds: {
              create: [{ label: "Einzelbett", monthlyRentCents: 39000, sortOrder: 0 }],
            },
          },
        ],
      },
    },
    include: { rooms: { include: { beds: true } } },
  });

  await prisma.property.create({
    data: {
      name: "Apartmenthaus Weserpark",
      street: "Am Weserpark 3",
      zip: "28327",
      city: "Bremen",
      shortCode: "WES",
      rooms: {
        create: [
          {
            name: "Apartment 1",
            floor: "2. OG",
            sizeSqm: 28,
            sortOrder: 1,
            defaultBedRentCents: 42000,
            beds: {
              create: [
                { label: "Bett A", monthlyRentCents: 42000, sortOrder: 0 },
                { label: "Bett B", monthlyRentCents: 42000, sortOrder: 1 },
              ],
            },
          },
          {
            name: "Apartment 2",
            floor: "2. OG",
            sizeSqm: 26,
            sortOrder: 2,
            defaultBedRentCents: 42000,
            beds: {
              create: [
                { label: "Bett A", monthlyRentCents: 42000, sortOrder: 0 },
                { label: "Bett B", monthlyRentCents: 42000, sortOrder: 1, status: "BLOCKED", notes: "Matratze defekt" },
              ],
            },
          },
        ],
      },
    },
  });

  const bed1 = hafen.rooms[0].beds[0];
  const bed2 = hafen.rooms[1].beds[0];
  const year = new Date().getUTCFullYear();

  // Mieter mit unterschriebenem Vertrag
  await prisma.tenant.create({
    data: {
      firstName: "Tomasz",
      lastName: "Kowalski",
      email: "t.kowalski@example.com",
      phone: "+48 601 234 567",
      company: "MontagePro Sp. z o.o.",
      nationality: "polnisch",
      street: "ul. Kwiatowa 5",
      zip: "60-001",
      city: "Poznań",
      country: "Polen",
      tenancies: {
        create: {
          bedId: bed1.id,
          startDate: daysAgo(75),
          monthlyRentCents: 35000,
          depositCents: 35000,
          billingDay: 1,
          reference: `WW-${year}-0001`,
          status: "ACTIVE",
          contract: {
            create: {
              contractNumber: `MV-${year}-0001`,
              token: token(),
              status: "SIGNED",
              sentAt: daysAgo(80),
              viewedAt: daysAgo(79),
              signedAt: daysAgo(78),
              signerName: "Tomasz Kowalski",
            },
          },
        },
      },
    },
  });

  // Mieter, dessen Vertrag noch auf die Unterschrift wartet
  await prisma.tenant.create({
    data: {
      firstName: "Andrei",
      lastName: "Popescu",
      email: "a.popescu@example.com",
      company: "Instal Bau SRL",
      nationality: "rumänisch",
      tenancies: {
        create: {
          bedId: bed2.id,
          startDate: daysAgo(3),
          endDate: daysAgo(-90),
          monthlyRentCents: 35000,
          billingDay: 1,
          reference: `WW-${year}-0002`,
          status: "SENT",
          contract: {
            create: {
              contractNumber: `MV-${year}-0002`,
              token: token(),
              status: "SENT",
              sentAt: daysAgo(4),
              tokenExpiresAt: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    },
  });

  await prisma.bankAccount.create({
    data: {
      name: "Geschäftskonto",
      iban: "DE02120300000000202051",
      bic: "BRLADE21BRE",
    },
  });

  console.log("Beispieldaten wurden angelegt:");
  console.log("  2 Objekte, 5 Zimmer, 10 Betten");
  console.log("  2 Mieter (1 unterschrieben, 1 wartet auf Unterschrift)");
  console.log("  1 Bankkonto");
  console.log("");
  console.log("Mietforderungen entstehen beim ersten Aufruf der offenen Posten.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
