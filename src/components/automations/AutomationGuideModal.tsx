'use client'

type Props = { onClose: () => void }

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-guide-section">
      <div className="pt-guide-section-label">{label}</div>
      {children}
    </div>
  )
}

function Row({ name, desc, example }: { name: string; desc: string; example?: string }) {
  return (
    <div className="pt-guide-row">
      <div className="pt-guide-row-name">{name}</div>
      <div className="pt-guide-row-desc">{desc}</div>
      {example && <div className="pt-guide-row-example">e.g. {example}</div>}
    </div>
  )
}

export default function AutomationGuideModal({ onClose }: Props) {
  return (
    <div className="pt-lightbox" onClick={onClose}>
      <div className="pt-card pt-au-modal pt-guide-modal" onClick={e => e.stopPropagation()}>

        <div className="pt-card-hd">
          <div>
            <h3>How automations work</h3>
            <p>Every automation is a simple rule: <b>When</b> something happens, <b>if</b> conditions are met, <b>then</b> take an action.</p>
          </div>
          <button className="pt-au-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pt-card-body pt-au-modal-body">

          {/* WHEN */}
          <Section label="WHEN — What triggers it">
            <Row
              name="New thread"
              desc="Fires when a customer contacts you for the first time on any channel."
              example="Send a welcome message to every new customer"
            />
            <Row
              name="Order state change"
              desc="Fires when an order moves to a specific status — awaiting, confirming, packing, shipped, delivered, or disputed."
              example="Send a follow-up 2 days after an order is delivered"
            />
            <Row
              name="Schedule"
              desc="Runs automatically at a set hour every day. Use 'Each customer individually' to evaluate conditions per person."
              example="Check every customer's cycle progress at 8am daily"
            />
          </Section>

          {/* WHO */}
          <Section label="WHO — Scope (schedule triggers only)">
            <Row
              name="The whole account"
              desc="The automation runs once per day — no customer is evaluated individually. Good for operator alerts and digests."
            />
            <Row
              name="Each customer individually"
              desc="The automation loops over every customer and checks the conditions for each one separately. Required for sending customer DMs."
              example="Only message customers whose cycle ends in 5 days or less"
            />
          </Section>

          {/* IF */}
          <Section label="IF — Conditions (all must be true)">
            <Row
              name="Trust score"
              desc="The customer's reliability rating from 0 to 100. Starts at 70 and changes with order history."
              example="Trust score is greater than or equal to 50"
            />
            <Row
              name="Lifetime value"
              desc="The total amount the customer has spent with you."
              example="Lifetime value is greater than or equal to 500"
            />
            <Row
              name="Hours since last message"
              desc="How many hours have passed since the last message in any conversation with this customer."
              example="Hours since last message is greater than or equal to 48"
            />
            <Row
              name="Is new customer"
              desc="Whether the customer has placed a delivered order yet. New means no completed orders."
              example="Is new customer is equal to Yes"
            />
            <Row
              name="Days remaining in cycle"
              desc="How many days are left in the customer's current product protocol cycle, based on their most recent delivered order."
              example="Days remaining in cycle is less than or equal to 5"
            />
            <Row
              name="Days since last order"
              desc="How many days have passed since the customer last placed an order."
              example="Days since last order is greater than or equal to 30"
            />
            <Row
              name="Customer has tag"
              desc="Whether the customer has been given a specific tag, such as vip, waitlist, or payment."
              example="Customer has tag is equal to vip"
            />
            <Row
              name="Don't re-fire within"
              desc="Prevents the automation from firing again for the same customer within a set number of days. Always add this when using 'Each customer individually' to avoid sending repeated messages."
              example="Don't re-fire within 30 days"
            />
          </Section>

          {/* THEN */}
          <Section label="THEN — What happens">
            <Row
              name="Send DM"
              desc="Sends a message to the customer via their channel (WhatsApp, Telegram, or email). You can require a review before it sends — the message will appear in the pending approvals queue for you to check first."
            />
            <Row
              name="Notify operator"
              desc="Sends an alert to you (the operator) inside the platform. Nothing is sent to the customer."
            />
            <Row
              name="Adjust trust score"
              desc="Increases or decreases the customer's trust score by a set amount."
              example="+3 when an order is delivered, −15 when a dispute is raised"
            />
            <Row
              name="Add task"
              desc="Creates a task reminder for you to follow up manually."
            />
          </Section>

          {/* Example */}
          <Section label="EXAMPLE — Reorder nudge">
            <div className="pt-guide-example-card">
              <div className="pt-guide-example-row">
                <span className="pt-guide-example-badge when">WHEN</span>
                <span>Schedule · 08:00 · Each customer individually</span>
              </div>
              <div className="pt-guide-example-row">
                <span className="pt-guide-example-badge if">IF</span>
                <span>Days remaining in cycle is less than or equal to <b>5</b></span>
              </div>
              <div className="pt-guide-example-row pt-guide-example-row-and">
                <span className="pt-guide-example-badge if">AND</span>
                <span>Don&apos;t re-fire within <b>30</b> days</span>
              </div>
              <div className="pt-guide-example-row">
                <span className="pt-guide-example-badge then">THEN</span>
                <span>Send DM · &ldquo;Hey! Your cycle is almost up — want to reorder?&rdquo; · Review required</span>
              </div>
            </div>
            <p className="pt-guide-tip">
              The cooldown condition means even if a customer stays at &ldquo;5 days remaining&rdquo; for several days, they only receive one message per 30-day window.
            </p>
          </Section>

        </div>

        <div className="pt-au-modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="pt-btn pt-btn-primary" onClick={onClose}>Got it</button>
        </div>

      </div>
    </div>
  )
}
