ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS event_effects boolean NOT NULL DEFAULT true;
--> statement-breakpoint
