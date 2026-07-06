-- game_match schema fix (see docs/AUTH.md §4)
-- Cause: the 0_init migration was generated against the ERD v1 draft (game_id + player1/2_id + P1_WIN enum),
--       but then schema.prisma changed to the slot model (player_a/b_id + A_WIN enum + separate game_round),
--       and the migration was never regenerated, so the DB and the Prisma client drifted apart.
--       → Until now persistMatch() failed every time with P2022 (missing column), and the error was swallowed in match.ts
--         (the root cause of the bug where not a single online match was ever saved to the DB).

-- Existing rows in the old structure are untrustworthy test data — wipe and start fresh (avoids FK/NOT NULL add conflicts)
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
