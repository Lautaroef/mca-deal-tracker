# Demo Walkthrough Guide

Step-by-step tour of the MCA Deal Tracker. Follow this exactly — it mirrors the 12 evaluation steps from the trial brief.

## Setup

```bash
pnpm seed   # Reset to clean data
pnpm dev    # Start at http://localhost:3001
```

---

## Step 1: Verify Seed Data

Open http://localhost:3001. You'll land on `/deals` with an empty state ("No user selected"). Look at the **dev toolbar** at the bottom of the screen — it shows "No user selected" with a dropdown.

**What to notice:** The app has no data visible until you pick a user. This is workspace isolation in action — no session = no workspace = no data.

---

## Step 2: Sign in as Workspace B Admin

Click the user dropdown in the dev toolbar → Select **David Park (admin)** under "Summit Capital Group".

**What to notice:** You see exactly **3 deals** — Riverside Coffee Roasters, Urban Fitness Studio, Greenleaf Landscaping. These are Workspace B's deals. Remember these names.

---

## Step 3: Switch to Workspace A Admin

Switch to **Sarah Chen (admin)** under "Apex Funding Brokers".

**What to notice:** The deal list now shows **10 deals** — completely different merchants (Mario's Pizza, Bay Area Auto Repair, etc.). **Zero overlap** with Workspace B. The two workspaces are fully isolated.

---

## Step 4: Note the Deal Count

Look at the deal count shown on the page. Sarah (admin) sees **all 10 deals** in Workspace A. Remember this number.

---

## Step 5: Switch to Team Leader

Switch to **Marcus Johnson (team_leader)**.

**What to notice:** The deal list **shrinks**. Marcus only sees deals assigned to reps on his team (Emily and Jake). Some deals that Sarah could see are now gone. This is the visibility cascade — team leaders see team deals, not all workspace deals.

---

## Step 6: Switch to a Rep

Switch to **Emily Rodriguez (rep)**.

**What to notice:** The list shrinks again. Emily sees **only her own deals**. Deals assigned to Jake are gone. The hierarchy is clear: Admin > Team Leader > Rep.

---

## Step 7: Advance a Deal Status

As Emily, find a deal in **Lead** status (look for the blue "Lead" badge). Click on that row to open the deal detail page.

On the detail page, you'll see:
- Deal info (merchant name, amount, status, etc.)
- **Status Transitions** section with buttons for valid next statuses
- **Activity Timeline** at the bottom

Click the **"New Application"** button in the status transitions section.

**What to notice:**
- The status badge updates immediately
- A toast notification confirms the change
- The activity timeline now shows a new entry: "Status changed from Lead to New Application"
- Click "Show metadata" on the event to see the structured JSONB: `{ old_status, new_status, old_status_label, new_status_label }`

---

## Step 8: Try an Invalid Transition

On that same deal (now "New Application"), the valid transitions are "Missing Documents" and "Ready to Submit". There is no "Funded" button because it's not a valid transition.

To demonstrate the server-side validation: the UI only shows valid buttons, but even if someone tried to call the API directly, the server would reject it with: *"Cannot transition from 'New Application' to 'Funded'. Valid transitions from 'New Application': Missing Documents, Ready to Submit"*

**What to notice:** Invalid transitions are enforced at the server, not just hidden in the UI.

---

## Step 9: Walk a Deal Through Multiple Statuses

Go back to the deal list. Find another deal in **Lead** status (or the same one if it's back at Lead).

Walk it through this path, clicking into the deal and advancing each time:
1. **Lead** → Click "New Application"
2. **New Application** → Click "Ready to Submit"
3. **Ready to Submit** → Click "Submitted"
4. **Submitted** → Click "Approved"

After each transition, scroll down to the activity timeline.

**What to notice:** The timeline accumulates entries. After all 4 transitions, you should see 4 "Status changed" events plus the original "Deal created" event — each with structured metadata showing the exact before/after state.

---

## Step 10: Soft Delete a Deal

On any deal detail page, click the **"Archive"** or **"Delete"** button. Confirm the action.

**What to notice:**
- You're redirected back to the deal list
- The deal is **gone** from the list
- But it's still in the database (the `deleted_at` field is set, row is preserved)
- The activity log has a "Deal archived" event

---

## Step 11: Run the Test Suite

```bash
pnpm test
```

**What to notice:** 55 tests, all green. Covers workspace isolation, visibility cascade, status transitions, activity log, and soft delete.

---

## Step 12: Review DECISIONS.md

Open `DECISIONS.md` in the repo root. Three sections covering the architectural decisions for workspace isolation, status transitions, and activity log — each with the chosen approach and one rejected alternative.

---

## Key Talking Points for the Demo

If Chance or Victor ask questions, here are the highlights:

- **"Why not Postgres RLS for workspace isolation?"** — RLS is powerful but harder to test, debug, and doesn't play well with Drizzle's query builder. The scoped builder pattern is more visible in code review and makes isolation impossible to forget.

- **"Why not XState for status transitions?"** — It's a directed graph with no side effects or guards. A simple lookup map is more readable, has zero dependencies, and is trivially testable.

- **"Why not database triggers for the activity log?"** — Triggers can't easily receive actor context (who did it), and the metadata structure varies by event type, which is easier to handle in application code with Zod schemas.

- **"How do you ensure workspace isolation isn't forgotten?"** — Service functions receive a `WorkspaceScope` object, not the raw database. They literally cannot query without workspace filtering. It's baked into the API surface, not a convention to remember.
