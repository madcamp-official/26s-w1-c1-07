-- 로스터 로그인 전환 (docs/AUTH.md 참조)
-- 구글 OAuth 폐기: google_sub / email / google_image_url 제거.
-- 닉네임 유니크를 전역 → 분반 단위로 변경 (같은 이름이 다른 분반에 존재 가능 — 예: "이서진").
-- ⚠️ 기존에 같은 (group_id, nickname) 중복 행이 있으면 CREATE UNIQUE INDEX 에서 실패한다.
--    그 경우 테스트 데이터 정리(game_match/app_user 비우기) 후 다시 migrate deploy 할 것.

-- DropIndex
DROP INDEX `uq_user_google` ON `app_user`;

-- DropIndex
DROP INDEX `uq_user_nickname` ON `app_user`;

-- AlterTable
ALTER TABLE `app_user` DROP COLUMN `email`,
    DROP COLUMN `google_image_url`,
    DROP COLUMN `google_sub`;

-- CreateIndex
CREATE UNIQUE INDEX `uq_user_group_nick` ON `app_user`(`group_id`, `nickname`);
