/**
 * Baseline seed — safe to run in every environment, including production.
 * Creates subscription plan records, default document templates, and (only
 * if SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD are set) the first platform
 * admin. Never seeds demo business data here — see seed-demo.ts for that,
 * which refuses to run when NODE_ENV=production.
 */
import { PLANS } from '@sendnaro/shared';
import { Prisma, PrismaClient } from '../generated/client/index.js';
import { hashPassword } from '../src/password.js';

const prisma = new PrismaClient();

async function seedPlans() {
  for (const plan of Object.values(PLANS)) {
    const limitsJson = plan.limits as unknown as Prisma.InputJsonValue;
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits,
        yearlyPriceMinorUnits: plan.yearlyPriceMinorUnits,
        currency: plan.currency,
        limitsJson,
        isActive: true,
      },
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits,
        yearlyPriceMinorUnits: plan.yearlyPriceMinorUnits,
        currency: plan.currency,
        limitsJson,
      },
    });
  }
  console.log(`Seeded ${Object.keys(PLANS).length} subscription plans.`);
}

async function seedDocumentTemplates() {
  const builtins = [
    { key: 'MODERN', name: 'Modern' },
    { key: 'CLASSIC', name: 'Classic' },
    { key: 'MINIMAL', name: 'Minimal' },
  ];
  for (const t of builtins) {
    // Built-in templates have workspaceId = null; Prisma's compound unique
    // helper doesn't accept null in a `where`, so look it up manually.
    const existing = await prisma.documentTemplate.findFirst({
      where: { workspaceId: null, key: t.key },
    });
    if (existing) {
      await prisma.documentTemplate.update({ where: { id: existing.id }, data: { name: t.name } });
    } else {
      await prisma.documentTemplate.create({ data: { key: t.key, name: t.name, isCustom: false } });
    }
  }
  console.log(`Seeded ${builtins.length} built-in document templates.`);
}

async function seedPlatformAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping platform admin seed.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Platform admin ${email} already exists — skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name: 'Platform Admin',
      passwordHash,
      emailVerified: new Date(),
      isPlatformAdmin: true,
      platformRole: 'PLATFORM_ADMIN',
    },
  });
  console.log(`Created platform admin: ${email}`);
}

/** Inserts defaults only when missing, so re-running the seed or redeploying never resets the owner's billing choice. */
async function seedBillingSettings() {
  const result = await prisma.applicationSetting.createMany({
    data: [
      { key: 'billing_required', value: false, description: 'Require a paid one-time activation for live sending' },
      { key: 'activation_currency', value: 'NGN', description: 'Activation price currency' },
    ],
    skipDuplicates: true,
  });
  console.log(`Billing settings: ${result.count} default(s) inserted (billing_required stays whatever the owner chose).`);
}

async function main() {
  await seedPlans();
  await seedBillingSettings();
  await seedDocumentTemplates();
  await seedPlatformAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
