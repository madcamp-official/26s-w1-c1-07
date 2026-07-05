-- game_match 스키마 보정 (docs/AUTH.md §4 참고)
-- 원인: 0_init 마이그레이션이 ERD v1 초안(game_id + player1/2_id + P1_WIN enum) 기준으로 생성된 뒤
--       schema.prisma 가 슬롯 모델(player_a/b_id + A_WIN enum + game_round 분리)로 바뀌었는데
--       마이그레이션이 재생성되지 않아 DB와 Prisma 클라이언트가 어긋났다.
--       → 지금까지 persistMatch()가 P2022(컬럼 없음)로 전부 실패했고, 에러는 match.ts에서 무시됨
--         (온라인 매치가 DB에 한 건도 저장되지 않던 버그의 근본 원인).

-- 구버전 구조의 기존 행은 신뢰할 수 없는 테스트 데이터 — 비우고 시작 (FK/NOT NULL 추가 충돌 방지)
DELETE FROM `match_edit_history`;
DELETE FROM `game_match`;

-- DropForeignKey
ALTER TABLE `game_match` DROP FOREIGN KEY `fk_match_game`;

-- DropForeignKey
ALTER TABLE `game_match` DROP FOREIGN KEY `fk_match_p1`;

-- DropForeignKey
ALTER TABLE `game_match` DROP FOREIGN KEY `fk_match_p2`;

-- DropIndex
DROP INDEX `fk_match_game` ON `game_match`;

-- DropIndex
DROP INDEX `ix_match_p1` ON `game_match`;

-- DropIndex
DROP INDEX `ix_match_p2` ON `game_match`;

-- AlterTable
ALTER TABLE `game_match` DROP COLUMN `game_id`,
    DROP COLUMN `player1_id`,
    DROP COLUMN `player2_id`,
    ADD COLUMN `player_a_id` BIGINT NOT NULL,
    ADD COLUMN `player_b_id` BIGINT NOT NULL,
    MODIFY `result` ENUM('A_WIN', 'B_WIN', 'DRAW') NOT NULL;

-- AlterTable
ALTER TABLE `match_edit_history` MODIFY `before_result` ENUM('A_WIN', 'B_WIN', 'DRAW') NOT NULL,
    MODIFY `after_result` ENUM('A_WIN', 'B_WIN', 'DRAW') NOT NULL;

-- CreateTable
CREATE TABLE `game_round` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `match_id` BIGINT NOT NULL,
    `round_index` INTEGER NOT NULL,
    `game_type` TINYINT NOT NULL,
    `result` ENUM('A_WIN', 'B_WIN', 'DRAW') NOT NULL,

    INDEX `ix_round_game`(`game_type`),
    UNIQUE INDEX `uq_round_match_idx`(`match_id`, `round_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ix_match_pa` ON `game_match`(`player_a_id`, `played_at`);

-- CreateIndex
CREATE INDEX `ix_match_pb` ON `game_match`(`player_b_id`, `played_at`);

-- AddForeignKey
ALTER TABLE `game_match` ADD CONSTRAINT `fk_match_pa` FOREIGN KEY (`player_a_id`) REFERENCES `app_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_match` ADD CONSTRAINT `fk_match_pb` FOREIGN KEY (`player_b_id`) REFERENCES `app_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_round` ADD CONSTRAINT `fk_round_match` FOREIGN KEY (`match_id`) REFERENCES `game_match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_round` ADD CONSTRAINT `fk_round_game` FOREIGN KEY (`game_type`) REFERENCES `game`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
