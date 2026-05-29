-- Corrective: auto-update updated_at + bound confidence to [0,1] on ai_suggestions.
create trigger ai_suggestions_updated_at
  before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

alter table public.ai_suggestions
  add constraint ai_suggestions_confidence_range check (confidence >= 0 and confidence <= 1);
