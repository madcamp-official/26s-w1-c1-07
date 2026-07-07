/**
 * MADPUMP seed data — game dictionary + scoring settings only.
 * Canonical: docs/ERD.md note #15 (game dictionary) / note #17 (single-row scoring settings).
 *
 * Classes/roster removed (docs/AUTH.md v3): users are created on Google login, so there is
 * no pre-seeded member list anymore.
 *
 * Idempotent: uses upsert so it is safe to run multiple times.
 * Run: npm --workspace @madpump/server run db:seed  (or npx prisma db seed)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Game type dictionary — fixed mapping to the code's game numbers (1~13). This table is the "code mirror".
// (id = screen order, matches shared/coins.ts GAME_ORDER)
const GAMES = [
  { id: 1, name: "Number Guess" },
  { id: 2, name: "Tide Fencing" },
  { id: 3, name: "Pump" },
  { id: 4, name: "Missile Match" },
  { id: 5, name: "Light Cycle" },
  { id: 6, name: "Dino Run" },
  { id: 7, name: "Icarus Match" },
  { id: 8, name: "Pew Pew" },
  { id: 9, name: "Speed Gomoku" },
  { id: 10, name: "Tug of War" },
  { id: 11, name: "HOT POTATO" },
  { id: 12, name: "RED LIGHT, GREEN LIGHT" },
  { id: 13, name: "POT SHOT" },
] as const;

async function main() {
  // Game dictionary: `name` has a unique constraint, so if renumbering moves a name to a different id
  // a plain upsert hits a unique collision. Handle it in two phases:
  //   (1) upsert every row with a temporary unique name ("__tmp_{id}") → frees the old names
  //   (2) update to the final names (all distinct → no collision)
  for (const g of GAMES) {
    await prisma.game.upsert({
      where: { id: g.id },
      update: { name: `__tmp_${g.id}` },
      create: { id: g.id, name: `__tmp_${g.id}`, isActive: true },
    });
  }
  for (const g of GAMES) {
    await prisma.game.update({ where: { id: g.id }, data: { name: g.name } });
  }

  // Scoring settings: always a single row (id=1). Defaults Win 3 / Draw 1 / Loss 0.
  await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: {}, // if it already exists, preserve the value the admin set (do not overwrite)
    create: { id: 1, winPoints: 3, drawPoints: 1, lossPoints: 0 },
  });

  const [games, users, cfg] = await Promise.all([
    prisma.game.count(),
    prisma.appUser.count(),
    prisma.scoreConfig.count(),
  ]);
  console.log(
    `✅ Seed done — game ${games} rows, app_user ${users} rows, score_config ${cfg} rows`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
