# Talking points — demo notes for a workshop owner

**What this is.** Not a feature list, and not another PRD. These are the points
worth raising in a demo because each one is a decision the software makes about
how a workshop actually runs. They are chosen to show that the boring,
expensive parts of the business — money, commitment, paperwork, who is allowed
to see what — were thought about, not just the screens.

**How to use it.** Each point has the same shape: what we noticed about
workshop practice, what the system does about it, and what can be tuned. The
"tune" line is the important one. If the owner disagrees with a default, that
is the useful part of the conversation, not a problem.

**State this plainly, early:**

- An **invoice comes first**. A job order is raised from it, never out of thin
  air.
- A **job order cannot be created until at least 50% of the invoice is paid.**
  That is the one hard money gate.
- **Recording a payment is never blocked** — not by billing type, not by
  category, not for post-service work.
- Every payment issues a **receipt**; a reprint is marked as a duplicate.
- **Technicians never see money.** Enforced in the database, not just hidden on
  screen.

---

## 1. The invoice is the agreement; the job card is the instruction

**What we noticed.** In a workshop the customer agrees a price *before* the bay
touches the car. The invoice is that agreement. The job card is what the
technician reads while working. They are different documents for different
people, and most small systems blur them into one.

**What the system does.** A job order cannot be created on its own; it is raised
from an invoice. The invoice holds the price and the line items. The job order
holds the work, the technician and the execution status.

**Why it matters.** Nobody has to reconcile two places where a price was written
down. The amount the customer agreed to is the amount the job is measured
against.

**Tune.** If the workshop sometimes starts work before paperwork exists, say
so. A "provisional invoice" path is possible, but it should be a deliberate
choice, not the default.

---

## 2. Half the money before the bay starts — the 50% rule

**What we noticed.** The biggest exposure in a workshop is a car in pieces and a
customer who has changed their mind. A deposit is the commitment that makes the
job real.

**What the system does.** The "Create job order" button stays locked until
payments cover **at least 50% of the invoice total**. The screen shows exactly
how much is still needed and how much has been paid. The server checks the same
rule independently, so the gate cannot be bypassed by a stale page.

**Why it matters.** This is not a distrust of customers; it is a shared
commitment point. It also stops the workshop from buying parts for a job that
was never really agreed.

**Tune.** 50% is a default. It can be different per category, per billing type,
or per customer — or removed entirely for a trusted account. The number is one
constant, not scattered through the code. Ask: *"What deposit do you actually
ask for today, and is it always the same?"*

**The boundary worth repeating:** the 50% rule gates **job-order creation**, not
payment. Once a job order exists, the work proceeds even if the balance is
still open.

---

## 3. Money can always be recorded

**What we noticed.** A customer walks in with cash. The software should never
be the reason the business refuses to take it. Billing type describes when money
is *expected*, not whether it is *allowed*.

**What the system does.** Payments can be recorded at any time, for any billing
type — upfront, instalmental or post-service. There is no "you cannot take
money for this yet" state.

**Why it matters.** Post-service is a credit decision the owner makes about a
customer, not a rule the software should enforce. And in practice, customers
pay early, in odd amounts, and at the counter on a Saturday.

**Tune.** If the owner wants a gentle prompt ("this invoice is post-service —
record anyway?") or a note on the receipt, we can add it **without blocking**
the payment. Blocking is the one thing we do not do.

---

## 4. "Paid" is calculated, never typed

**What we noticed.** The most common ledger failure in a small business is a
record that says *paid* while the money is not there. It usually happens because
someone marked it paid by hand and forgot to reconcile it later.

**What the system does.** An invoice's financial state — **unpaid, part-paid,
paid** — is derived from the invoice total versus the payments recorded against
it. There is no "mark as paid" switch in the normal flow. The job order's own
financial status is kept in step by the database when a payment is added.

**Why it matters.** The status cannot drift away from the money. Two people
looking at the same invoice see the same answer.

**Tune.** Genuine exceptions exist (a waiver, a write-off, a correction). If the
owner wants an officer-only override, it can be kept as a deliberate, audited
action rather than an everyday button.

---

## 5. Every payment gets a receipt — and a reprint says DUPLICATE

**What we noticed.** Paper gets lost. Customers come back for another copy. When
there is a dispute, the question is "what was issued?" — not "what does the
system say now?"

**What the system does.** Recording a payment issues a receipt immediately, with
its own gapless number (`RCP-2026-0001`). Reprinting does **not** edit the
original: it creates a **new receipt marked DUPLICATE** that points back to the
original. A reprint of a reprint still points at the original — no chains.

**Why it matters.** The paper trail shows both the first issue and every copy.
The original can never be quietly changed or deleted, by anyone, including an
admin.

**Tune.** A4 browser print is the current answer, because most workshops have an
A4 printer, not a thermal roll. Who may reprint, and whether a duplicate needs
a signature, are policy choices.

---

## 6. Document numbers do not have gaps

**What we noticed.** Owners and auditors read a missing number as a missing job
or missing money. Workshops also file by number, so the number has to mean
something on paper.

**What the system does.** Job orders and receipts use per-year gapless counters
(`JO-2026-0001`, `RCP-2026-0001`). They reset each year and are never reused.
The counter advances through a database routine, not from the browser.

**Why it matters.** The paper file and the system agree. An auditor can ask
"show me 14" and get exactly one answer.

**Tune.** Prefixes, the year reset, or a branch code can change if the business
opens a second location.

---

## 7. Technicians do not see money

**What we noticed.** Pricing, discounts and balances are front-desk
conversations. A technician should not be put in the position of being asked
"how much did they pay?" while holding a spanner.

**What the system does.** Technicians get the vehicle lens and execution
updates. They have **no read or write access** to invoices, payments or receipts.
That is enforced by database row-level security, so it is not a matter of hiding
a menu item.

**Why it matters.** It protects the owner's pricing, and it protects the
technician from being drawn into a money conversation.

**Tune.** If a senior technician genuinely needs to know whether parts are
cleared, expose a yes/no "parts cleared" flag — not the amounts.

---

## 8. Two statuses, because "finished" and "paid" are not the same thing

**What we noticed.** A car can be finished and unpaid. It can also be paid and
waiting for a part. A single status forces the workshop to lie about one of
them.

**What the system does.** Every job order carries two independent statuses:

| Execution | Financial |
|---|---|
| pending · in progress · waiting for parts · completed · cancelled | unpaid · part-paid · paid |

Technicians change execution by posting a job log on a job assigned to them.
Officers can set it directly, and officer changes are audited. Only officers can
cancel.

**Why it matters.** The floor reports work; the front desk reports money. Each
sees the truth for their own question.

**Tune.** The execution list can grow — "test drive", "quality check", "ready
for pickup" — if that is how the bays actually move.

---

## 9. The vehicle is the technician's front door

**What we noticed.** In a real bay, technicians work on the car in front of
them, cover for each other, and need the history of that vehicle. An "only my
assigned jobs" list goes stale the moment someone helps out.

**What the system does.** A technician enters the plate and opens that vehicle's
jobs on the spot. They can update execution status. Nothing about money
appears. (The main vehicle directory also searches by model, VIN and owner; the
technician lens deliberately stays plate-first.)

**Why it matters.** It matches how work is actually found — by the car, not by
a roster. It also means a technician can answer "has this car been in before?"

**Tune.** If the owner wants stricter control, status changes can require the
job to be assigned first.

---

## 10. The job card is a workshop document, not an invoice

**What we noticed.** The card sits in the car. It gets oily, handed around, and
read by people who are not the customer. Pricing does not belong on it.

**What the system does.** The printed job card carries the owner's name and
phone, the vehicle details, the work requested, and the parts/labour split — but
**no costs at all**. It has a QR code that opens the live job order, so the
latest status is one scan away instead of a reprint.

**Why it matters.** The workshop can leave the card in the vehicle without
leaking what the customer paid. The QR replaces the "walk to the front desk and
ask" step.

**Tune.** Signature lines (technician / customer / reception) are still an open
decision. If the workshop uses signatures on paper today, add them; if not,
leave the card clean.

---

## 11. Parts and labour are separate lines

**What we noticed.** A part is something fitted. Labour is something done.
Flattening them into one list tells a technician to "do" a part, and hides what
was actually consumed.

**What the system does.** Invoice lines carry a type. The job card groups parts
and labour separately. A line with no type defaults to labour, so the common
case stays fast to enter.

**Why it matters.** The card reads the way the bay works, and parts consumption
is visible without a separate stock system.

**Tune.** Add "consumables" or "sublet" as a third type if the workshop tracks
them separately.

---

## 12. "Work requested" is optional

**What we noticed.** Not every car arrives with a fault. A CNG conversion
arrives healthy. Forcing staff to invent a complaint corrupts the record and
makes later reports meaningless.

**What the system does.** The field — formerly "complaint" — is optional on both
invoices and job orders. If it is blank, documents print a placeholder instead
of an empty gap.

**Why it matters.** Staff record what is true, not what the form demands.

**Tune.** It could be required for maintenance and optional for CNG and sales,
if the owner wants the discipline where it matters.

---

## 13. Customers are records, not logins

**What we noticed.** Workshop customers will not create an account, verify an
email or remember a password to drop off a car. Requiring that kills the first
visit.

**What the system does.** Staff create the customer at the counter. The customer
is a record — name, phone, vehicles, history — not an authenticated user. The
phone number is the real identifier.

**Why it matters.** Zero onboarding friction. The front desk can serve a
first-time customer in the time it takes to write a phone number.

**Tune.** A customer portal (status updates, receipts by link) can come later
without changing the counter workflow.

---

## 14. Search by plate, not by name

**What we noticed.** At the counter you have a plate, a phone number or a face —
not a customer ID. A full vehicle list is slow to scan and quietly exposes the
whole customer book.

**What the system does.** `/vehicles` shows **nothing until you search** — by
plate, model, VIN or owner. `/customers` is a searchable list. Both edit inline;
there is no separate "edit" screen to get lost in.

**Why it matters.** It matches the question the receptionist actually has:
"which car is this?"

**Tune.** Recent searches or a "today's cars" view can be added for the morning
rush.

---

## 15. A second car does not mean a second customer

**What we noticed.** A returning customer buys another vehicle, or brings a
second one for conversion. Retyping the customer is how duplicate records and
lost history begin.

**What the system does.** A vehicle is added to the existing customer. On the
invoice form, the vehicle list is filtered to the selected customer, so the
wrong car is hard to pick.

**Why it matters.** The customer is the anchor; vehicles hang off them. History
stays in one place.

**Tune.** If duplicate customers already exist in the old records, a merge tool
is a sensible follow-up.

---

## 16. Category and billing type answer different questions

**What we noticed.** The old vocabulary had "CNG instalment", which mixed *what
the job is* with *when it is paid* — as if only CNG work could be paid in
instalments.

**What the system does.** Two independent fields:

- **Category** — what the work is: `sales`, `maintenance`, `cng`.
- **Billing type** — when money comes: `upfront`, `instalmental`,
  `post-service`.

Any category can use any billing type. A maintenance job can be instalmental; a
CNG conversion can be paid upfront.

**Why it matters.** Reports can ask "how much CNG work did we do?" and "how much
is on instalments?" without one answer distorting the other.

**Tune.** Categories and billing types are lists, not hard-coded screens. The
relationship between them (for example, what a `sales` invoice may use) is
still being designed.

---

## 17. "Instalmental" is a label today, a schedule later

**What we noticed.** An instalment plan is not a label; it is a set of due
dates, amounts and reminders. Pretending to track overdue instalments without
that structure produces numbers that are simply wrong.

**What the system does.** The billing type exists and is recorded. There is
**no due-date schedule and no overdue chasing** in the current build. That is
deliberate.

**Why it matters.** The owner can label the arrangement today without the system
inventing an overdue balance it cannot justify. When the schedule is built, the
label is already in the right place.

**Tune.** The later pass adds the number of instalments, amounts, due dates and
reminders. Overdue reporting returns only when there is a real schedule behind
it.

---

## Planned, so the demo does not overpromise

Say these as "next", not "now":

- **Payment proof** — required evidence: a photo **or** a receipt/reference
  number, plus an optional note. Counter practice varies, so upload-only would
  be wrong.
- **Email notifications** — job order created, payment received, monthly
  report. Best-effort: a failed email never rolls back a payment or a job.
- **Dashboard and monthly report** — revenue, outstanding, active jobs, and a
  printable monthly summary. No fake overdue figure.
- **Audit log viewer** — who changed what, when, including officer status
  changes.
- **User management** — invite, disable, change role. Role matrix still to be
  confirmed with the owner.
- **Technician PWA / offline** — will be built, later. The responsive vehicle
  lens is the mobile answer until then.
- **Instalment schedule** — see point 17.
- **Walk-in parts sale** — customer required, vehicle optional; a sales invoice
  can never raise a job order. Later.
- **Job-card signatures** — technician / customer / reception; decision open.
- **Vehicle service history** — a chronological record per vehicle, with minor
  non-billable work.

---

## Questions worth asking in the demo

1. What deposit do you actually ask for today — always the same, or by job type?
2. Who is allowed to take money, and who is allowed to change a status?
3. When a customer pays by transfer, what do you keep as proof — a screenshot, a
   slip number, a note?
4. Do you reprint receipts? Who asks, and how often?
5. Is the printer in the office A4, or is there a thermal printer in the bay?
6. Does the job card get signed today? By whom?
7. What does "instalmental" mean in practice — how many payments, how often,
   and who chases them?
8. Do you ever sell a part over the counter with no vehicle involved?
9. Which report do you actually look at each month, and what do you do with it?
10. Do technicians have signal in the bay, or does the phone lose connection?

---

## The one-liner

> Invoice first. Half-paid before the bay. Every payment receipted. The floor
> never touches money.
