/**
 * 정크 분반 정리 스크립트 — 표준 분반("1분반","2분반","3분반") 외의 user_group 을 삭제한다.
 * 삭제 전 해당 그룹 소속 유저의 group_id 를 null 로 풀어준다 (FK Restrict 대응).
 * 유저 계정 자체는 삭제하지 않는다.
 *
 * 실행: npm --workspace @madpump/server run db:cleanup-groups
 *  (DATABASE_URL 이 대상 DB — 로컬 docker 또는 배포 VM — 를 가리키는 상태에서)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALLOWED = new Set(["1분반", "2분반", "3분반"]);

async function main() {
  const junk = await prisma.userGroup.findMany({
    where: { name: { notIn: [...ALLOWED] } },
    include: { _count: { select: { users: true } } },
  });
  if (junk.length === 0) {
    console.log("✅ 정크 그룹 없음 — 정리할 것이 없습니다.");
    return;
  }

  console.log("삭제 대상 그룹:");
  for (const g of junk) console.log(`  - "${g.name}" (id=${g.id}, 소속 유저 ${g._count.users}명 → group_id null 처리)`);

  const junkIds = junk.map((g) => g.id);
  const [detached, deleted] = await prisma.$transaction([
    prisma.appUser.updateMany({ where: { groupId: { in: junkIds } }, data: { groupId: null } }),
    prisma.userGroup.deleteMany({ where: { id: { in: junkIds } } }),
  ]);
  console.log(`✅ 완료 — 유저 ${detached.count}명 분반 해제, 그룹 ${deleted.count}개 삭제`);
}

main()
  .catch((e) => {
    console.error("❌ 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
