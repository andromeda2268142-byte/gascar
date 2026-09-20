# Gas Car's Provider / Lead QA Matrix

This checklist is for the temporary development environment. Run it with at least two driver accounts, two mechanics, one towing provider and one admin.

## Matching and realtime

- Create a Shop-only brake mechanic in ZIP 75201. A Shop brake lead in 75201 must appear without manual refresh.
- Create a Mobile-only brake mechanic in ZIP 75201. The same Shop lead must not appear.
- Create a Mobile brake lead. It must appear for the Mobile mechanic and not the Shop-only mechanic.
- Create a brake lead in another ZIP. It must not appear unless that ZIP is in the provider's service area.
- Create an A/C lead. A brake-only mechanic must not receive it.
- Approve a Pending provider while the provider portal is open. Lead access should refresh automatically.
- Suspend an active provider. New matched leads should disappear / become unavailable.

## Credits and lead acceptance

- Provider with 0 credits sees an Add credits action instead of a failing accept attempt.
- Buy a development credit pack. Wallet balance and ledger should update without manual refresh.
- Accept a 3-credit lead with exactly 3 credits. Balance becomes 0 and customer contact unlocks.
- Double-click / retry acceptance. The wallet must never be charged twice.
- Two matching providers view the same lead. After one accepts it, the other must lose access to it.
- Attempt to accept an expired lead. Show a friendly "no longer available" message and refresh the list.
- Attempt to accept a lead after changing service mode so it no longer matches. Server must reject it.
- Accepted lead can move to In Progress and then Completed, but not through an invalid status transition.

## Privacy

- Before acceptance, provider cannot read customer phone/email.
- After acceptance, only the winning provider can read contact details.
- Another provider must not gain contact access.
- Driver contact data should remain separate from the public lead row.

## Wallet integrity

- Wallet balance can never go negative.
- Every credit purchase or admin grant writes a positive ledger entry.
- Every lead acceptance writes a negative ledger entry.
- Wallet balance must equal the latest ledger balance_after value.
- Refunded credits must reference a lead.
- Admin Overview automated system checks should report PASS after each test run.

## Provider state

- Pending business can configure services but cannot see/accept leads.
- Active + verified business can receive matched leads.
- Suspended business cannot accept leads.
- Business account cannot enter Driver Request/Garage navigation.
- Driver account cannot create a provider profile.

## Payment path before production

- Development Test Purchase may add credits only when development mode is enabled.
- Production credit grants must be performed server-side only after verified Stripe payment.
- Retrying a Stripe webhook must be idempotent using the provider session / request ID.
- Failed or abandoned checkout must never add credits.
- Refunded payment must have an explicit reversal/refund policy before launch.
