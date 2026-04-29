UPDATE public.tenant_channels
SET credentials = jsonb_build_object('phone_number', identifier)
WHERE channel_type = 'whatsapp'
  AND (credentials ? 'api_key' OR credentials ? 'phone_number_id');
