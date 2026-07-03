/**
 * MADPUMP 시드 데이터
 * 정본: docs/ERD.md note #15(게임 사전) / note #17(점수 설정 단일 행)
 *
 * 멱등(idempotent): 여러 번 실행해도 안전하도록 upsert 사용.
 * 실행: npm --workspace @madpump/server run db:seed  (또는 npx prisma db seed)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 게임 종류 사전 — 코드의 게임 번호(1/2/3)와 고정 매핑. 이 테이블은 "코드 미러".
const GAMES = [
  { id: 1, name: "숫자 맞추기" },
  { id: 2, name: "총알 피하기" },
  { id: 3, name: "펜싱" },
] as const;

async function main() {
  for (const g of GAMES) {
    await prisma.game.upsert({
      where: { id: g.id },
      update: { name: g.name }, // 이름만 동기화, is_active 는 운영 값 보존
      create: { id: g.id, name: g.name, isActive: true },
    });
  }

  // 점수 설정: 항상 단일 행(id=1). 승3 / 무1 / 패0 기본값.
  await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: {}, // 이미 있으면 admin 이 바꿔놓은 값 보존 (덮어쓰지 않음)
    create: { id: 1, winPoints: 3, drawPoints: 1, lossPoints: 0 },
  });

  const [games, cfg] = await Promise.all([
    prisma.game.count(),
    prisma.scoreConfig.count(),
  ]);
  console.log(`✅ Seed 완료 — game ${games}행, score_config ${cfg}행`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed 실패:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
