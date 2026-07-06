-- Roster login migration (see docs/AUTH.md)
-- Drop Google OAuth: remove google_sub / email / google_image_url.
-- Change nickname uniqueness from global to per-class (the same name may exist in different classes — e.g. "Lee Seojin").
-- ⚠️ If duplicate (group_id, nickname) rows already exist, CREATE UNIQUE INDEX will fail.
--    In that case, clean up test data (empty game_match/app_user) and run migrate deploy again.

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
