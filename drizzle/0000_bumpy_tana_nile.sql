CREATE TABLE `attendance` (
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`marked_at` text NOT NULL,
	`source` text NOT NULL,
	`event_id` text,
	PRIMARY KEY(`session_id`, `student_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`faculty_id` text NOT NULL,
	`room` text NOT NULL,
	FOREIGN KEY (`faculty_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`course_id` text NOT NULL,
	`student_id` text NOT NULL,
	PRIMARY KEY(`course_id`, `student_id`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`reader_id` text NOT NULL,
	`event_id` text NOT NULL,
	`uid` text NOT NULL,
	`outcome` text NOT NULL,
	`message` text NOT NULL,
	`student_name` text,
	`session_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_event_unique` ON `events` (`reader_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `event_time` ON `events` (`created_at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`started_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logins` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `readers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`last_seen` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readers_token_hash_unique` ON `readers` (`token_hash`);--> statement-breakpoint
CREATE TABLE `roster` (
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `student_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`reader_id` text NOT NULL,
	`title` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`status` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_reader` ON `sessions` (`reader_id`) WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_course` ON `sessions` (`course_id`) WHERE status = 'open';--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`roll` text NOT NULL,
	`email` text NOT NULL,
	`card_uid` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_roll_unique` ON `students` (`roll`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_email_unique` ON `students` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_card_uid_unique` ON `students` (`card_uid`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`student_id` text,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);