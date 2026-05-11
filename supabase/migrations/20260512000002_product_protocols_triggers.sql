-- supabase/migrations/20260512000002_product_protocols_triggers.sql
-- Add missing updated_at triggers and product_id index to protocol tables

CREATE TRIGGER product_protocols_updated_at
  BEFORE UPDATE ON product_protocols
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_protocol_overrides_updated_at
  BEFORE UPDATE ON customer_protocol_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX product_protocols_product_id_idx ON product_protocols (product_id);
