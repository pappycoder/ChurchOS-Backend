-- Add paused_at field to recurring_giving for pause/resume functionality
ALTER TABLE recurring_giving ADD COLUMN paused_at TIMESTAMP;
