-- CreateTable
CREATE TABLE `user_group` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_group_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `google_sub` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `google_image_url` VARCHAR(500) NULL,
    `uploaded_image_key` VARCHAR(300) NULL,
    `group_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `uq_user_google`(`google_sub`),
    UNIQUE INDEX `uq_user_nickname`(`nickname`),
    INDEX `ix_user_group`(`group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_account` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `login_id` VARCHAR(50) NOT NULL,
    `pw_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_admin_login`(`login_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game` (
    `id` TINYINT NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `uq_game_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_match` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `game_id` TINYINT NOT NULL,
    `player1_id` BIGINT NOT NULL,
    `player2_id` BIGINT NOT NULL,
    `result` ENUM('P1_WIN', 'P2_WIN', 'DRAW') NOT NULL,
    `played_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `ix_match_p1`(`player1_id`, `played_at`),
    INDEX `ix_match_p2`(`player2_id`, `played_at`),
    INDEX `ix_match_played`(`played_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_edit_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `match_id` BIGINT NOT NULL,
    `admin_id` BIGINT NOT NULL,
    `before_result` ENUM('P1_WIN', 'P2_WIN', 'DRAW') NOT NULL,
    `after_result` ENUM('P1_WIN', 'P2_WIN', 'DRAW') NOT NULL,
    `edited_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_meh_match`(`match_id`, `edited_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_config` (
    `id` TINYINT NOT NULL,
    `win_points` INTEGER NOT NULL DEFAULT 3,
    `draw_points` INTEGER NOT NULL DEFAULT 1,
    `loss_points` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` BIGINT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_user` ADD CONSTRAINT `fk_user_group` FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_match` ADD CONSTRAINT `fk_match_game` FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_match` ADD CONSTRAINT `fk_match_p1` FOREIGN KEY (`player1_id`) REFERENCES `app_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_match` ADD CONSTRAINT `fk_match_p2` FOREIGN KEY (`player2_id`) REFERENCES `app_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_edit_history` ADD CONSTRAINT `fk_meh_match` FOREIGN KEY (`match_id`) REFERENCES `game_match`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_edit_history` ADD CONSTRAINT `fk_meh_admin` FOREIGN KEY (`admin_id`) REFERENCES `admin_account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_config` ADD CONSTRAINT `fk_cfg_admin` FOREIGN KEY (`updated_by`) REFERENCES `admin_account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

