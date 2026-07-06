/**
 * MADPUMP 시드 데이터
 * 정본: docs/ERD.md note #15(게임 사전) / note #17(점수 설정 단일 행) / docs/AUTH.md(로스터 로그인)
 *
 * 멱등(idempotent): 여러 번 실행해도 안전하도록 upsert 사용.
 * 실행: npm --workspace @madpump/server run db:seed  (또는 npx prisma db seed)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 게임 종류 사전 — 코드의 게임 번호(1~13)와 고정 매핑. 이 테이블은 "코드 미러".
// (id = 화면 순서, shared/coins.ts GAME_ORDER 와 일치)
const GAMES = [
  { id: 1, name: "숫자 맞추기" },
  { id: 2, name: "타이드 펜싱" },
  { id: 3, name: "펌프" },
  { id: 4, name: "미사일 매치" },
  { id: 5, name: "라이트 사이클" },
  { id: 6, name: "공룡 달리기" },
  { id: 7, name: "이카루스 매치" },
  { id: 8, name: "뿌슝뿌슝" },
  { id: 9, name: "스피드 오목" },
  { id: 10, name: "줄다리기" },
  { id: 11, name: "HOT POTATO" },
  { id: 12, name: "RED LIGHT, GREEN LIGHT" },
  { id: 13, name: "POT SHOT" },
] as const;

// 분반별 고정 멤버 로스터 — 로그인은 이 명단에서 선택 (docs/AUTH.md).
// 같은 이름이 다른 분반에 있을 수 있다(예: 이서진) → app_user 유니크는 (group_id, nickname).
const ROSTER: Record<string, string[]> = {
  "1분반": [
    "이지민", "박준서", "라태형", "이종혁", "유나연", "유영석", "김태현", "권순호",
    "이유담", "안종화", "허서준", "이서진", "정서영", "이예원", "김희서", "주성민",
  ],
  "2분반": [
    "박서윤", "최재윤", "김민재", "이예지", "김경원", "이재준", "양우현", "주영준",
    "박지민", "황시우", "박채훈", "박소요", "원건희", "이서영", "임유빈", "박도현",
    "박정준", "김도현", "김도연",
  ],
  "3분반": [
    "손기환", "김윤서", "양호성", "정유진", "김민", "조예준", "안소희", "이서진",
    "강우현", "송재훈", "이지오", "김재훈", "임성진", "박지호", "조준호", "김규민",
    "서영빈", "김혜리", "박수현", "박민수",
  ],
};

async function main() {
  // 게임 사전: name 에 unique 제약이 있어, 재번호로 이름이 자리를 바꾸면(예: 이전 DB의 id2="미사일 매치"
  // → 새 id2="타이드 펜싱") 단순 upsert가 유니크 충돌한다. 2단계로 처리:
  //   (1) 모든 행을 임시 유니크명("__tmp_{id}")으로 upsert → 기존 이름 해방
  //   (2) 최종명으로 update (모두 서로 다른 이름 → 충돌 없음)
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

  // 분반 + 멤버 로스터
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
        update: { deletedAt: null }, // soft-delete 됐던 멤버도 로스터에 있으면 복구
        create: { nickname, groupId: group.id },
      });
      userCount += 1;
    }
  }

  // 점수 설정: 항상 단일 행(id=1). 승3 / 무1 / 패0 기본값.
  await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: {}, // 이미 있으면 admin 이 바꿔놓은 값 보존 (덮어쓰지 않음)
    create: { id: 1, winPoints: 3, drawPoints: 1, lossPoints: 0 },
  });

  const [games, groups, users, cfg] = await Promise.all([
    prisma.game.count(),
    prisma.userGroup.count(),
    prisma.appUser.count(),
    prisma.scoreConfig.count(),
  ]);
  console.log(
    `✅ Seed 완료 — game ${games}행, user_group ${groups}행, app_user ${users}행(로스터 ${userCount}명), score_config ${cfg}행`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed 실패:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
