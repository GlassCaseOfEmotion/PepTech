export type TriggerType = 'protocol_progress' | 'schedule' | 'new_thread' | 'order_state'
export type ActionType = 'send_dm' | 'operator_alert' | 'score_adjust' | 'operator_task'
export type AutoState = 'on' | 'off' | 'paused'
export type RunState = 'ok' | 'skip' | 'warn' | 'err' | 'queued' | 'scheduled'

export type Condition =
  // Existing
  | { type: 'trust_score';             operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'ltv';                     operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'last_message_hours';      operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'is_new_customer';         operator: 'eq';                  value: boolean }
  // New
  | { type: 'protocol_days_remaining'; operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'days_since_last_order';   operator: 'gte' | 'lte' | 'eq'; value: number }
  | { type: 'has_tag';                 operator: 'eq';                  value: string  }
  | { type: 'cooldown_days';           value: number }

export type TriggerParams =
  | { days_before_end: number }                        // protocol_progress
  | { cron: string; scope?: 'tenant' | 'customers' }   // schedule
  | Record<string, never>                               // new_thread
  | { to_status: string }                              // order_state

export type ActionParams =
  | { message: string; review_required: boolean }  // send_dm
  | { message: string; severity: 'info' | 'warn' | 'err' }  // operator_alert
  | { delta: number; reason: string }              // score_adjust
  | { title: string }                              // operator_task

export type Automation = {
  id: string
  tenant_id: string
  name: string
  icon: string
  state: AutoState
  trigger_type: TriggerType
  trigger_params: Record<string, unknown>
  conditions: Condition[]
  action_type: ActionType
  action_params: Record<string, unknown>
  sort_order: number
  created_at: string
  updated_at: string
}

export type AutomationRun = {
  id: string
  automation_id: string
  tenant_id: string
  state: RunState
  context_ref: string | null
  context_label: string | null
  action_summary: string | null
  action_payload: Record<string, unknown> | null
  created_at: string
}

export type AutomationWithRuns = Automation & { automation_runs: AutomationRun[] }

// Presentation type — transformed from automation_runs + joined automation name for UI display
export type QueuedRun = {
  id: string
  automationName: string
  contextLabel: string | null
  message: string
  conversationId: string | null
  createdAt: string
}
