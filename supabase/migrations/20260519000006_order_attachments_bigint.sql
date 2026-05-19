-- Widen file_size to bigint (conventional for byte counts)
-- Attachments are immutable — no UPDATE policy by design
ALTER TABLE order_attachments ALTER COLUMN file_size TYPE bigint;
