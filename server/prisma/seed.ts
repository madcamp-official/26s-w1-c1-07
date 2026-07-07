/**
 * MADPUMP seed data
 * Canonical: docs/ERD.md note #15 (game dictionary) / note #17 (single-row scoring settings) / docs/AUTH.md (roster login)
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

// Fixed per-class member roster — login picks from this list (docs/AUTH.md).
// The same name can appear in different classes (e.g. Lee Seojin) → app_user uniqueness is (group_id, nickname).
const ROSTER: Record<string, string[]> = {
  "Class 1": [
    "Lee Jimin", "Park Junseo", "Ra Taehyeong", "Lee Jonghyeok", "Yu Nayeon", "Yu Yeongseok", "Kim Taehyeon", "Kwon Sunho",
    "Lee Yudam", "An Jonghwa", "Heo Seojun", "Lee Seojin", "Jeong Seoyeong", "Lee Yewon", "Kim Huiseo", "Ju Seongmin",
  ],
  "Class 2": [
    "Park Seoyun", "Choi Jaeyun", "Kim Minjae", "Lee Yeji", "Kim Gyeongwon", "Lee Jaejun", "Yang Uhyeon", "Ju Yeongjun",
    "Park Jimin", "Hwang Siu", "Park Chaehun", "Park Soyo", "Won Geonhui", "Lee Seoyeong", "Im Yubin", "Park Dohyeon",
    "Park Jeongjun", "Kim Dohyeon", "Kim Doyeon",
  ],
  "Class 3": [
    "Son Gihwan", "Kim Yunseo", "Yang Hoseong", "Jeong Yujin", "Kim Min", "Jo Yejun", "An Sohui", "Lee Seojin",
    "Kang Uhyeon", "Song Jaehun", "Lee Jio", "Kim Jaehun", "Im Seongjin", "Park Jiho", "Jo Junho", "Kim Gyumin",
    "Seo Yeongbin", "Kim Hyeri", "Park Suhyeon", "Park Minsu",
  ],
};

async function main() {
  // Game dictionary: `name` has a unique constraint, so if renumbering moves a name to a different id
  // (e.g. old DB id2="Missile Match" → new id2="Tide Fencing") a plain upsert hits a unique collision.
  // Handle it in two phases:
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

  // Classes + member roster
  let userCount = 0;
  for (const [groupName, members] of Object.entries(ROSTER)) {
    const group = await prisma.userGroup.upsert({
      where: { name: groupName },
      update: {},
      create: { name: groupName, isPublic: true },
    });
    for (const nickname of members) {
      await prisma.appUser.upsert({
        where: { groupId_nickname: { groupId: group.id, nickname } },
        update: { deletedAt: null }, // restore a soft-deleted member if they are in the roster
        create: { nickname, groupId: group.id },
      });
      userCount += 1;
    }
  }

  // Scoring settings: always a single row (id=1). Defaults Win 3 / Draw 1 / Loss 0.
  await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: {}, // if it already exists, preserve the value the admin set (do not overwrite)
    create: { id: 1, winPoints: 3, drawPoints: 1, lossPoints: 0 },
  });

  const [games, groups, users, cfg] = await Promise.all([
    prisma.game.count(),
    prisma.userGroup.count(),
    prisma.appUser.count(),
    prisma.scoreConfig.count(),
  ]);
  console.log(
    `✅ Seed done — game ${games} rows, user_group ${groups} rows, app_user ${users} rows (roster ${userCount} members), score_config ${cfg} rows`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
