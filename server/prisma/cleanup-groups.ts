/**
 * Junk class cleanup script — deletes any user_group other than the standard classes ("Class 1","Class 2","Class 3").
 * Before deletion, it clears the group_id of users in that group to null (to satisfy FK Restrict).
 * The user accounts themselves are not deleted.
 *
 * Run: npm --workspace @madpump/server run db:cleanup-groups
 *  (with DATABASE_URL pointing at the target DB — local docker or the deployment VM)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALLOWED = new Set(["Class 1", "Class 2", "Class 3"]);

async function main() {
  const junk = await prisma.userGroup.findMany({
    where: { name: { notIn: [...ALLOWED] } },
    include: { _count: { select: { users: true } } },
  });
  if (junk.length === 0) {
    console.log("✅ No junk groups — nothing to clean up.");
    return;
  }

  console.log("Groups to delete:");
  for (const g of junk) console.log(`  - "${g.name}" (id=${g.id}, ${g._count.users} member(s) → group_id set to null)`);

  const junkIds = junk.map((g) => g.id);
  const [detached, deleted] = await prisma.$transaction([
    prisma.appUser.updateMany({ where: { groupId: { in: junkIds } }, data: { groupId: null } }),
    prisma.userGroup.deleteMany({ where: { id: { in: junkIds } } }),
  ]);
  console.log(`✅ Done — ${detached.count} user(s) detached from their class, ${deleted.count} group(s) deleted`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
