# UI Improvement Plan -- MCA Deal Tracker

> Generated from a full code review of every page, component, and style file in the app.
> This plan is designed to be followed by an implementation agent without ambiguity.

---

## Table of Contents

1. [Layout & Navigation](#1-layout--navigation)
2. [Deal List Page](#2-deal-list-page)
3. [Deal Detail Page](#3-deal-detail-page)
4. [Activity Timeline](#4-activity-timeline)
5. [Status Transitions](#5-status-transitions)
6. [Dev Toolbar](#6-dev-toolbar)
7. [Typography & Spacing](#7-typography--spacing)
8. [Color & Theming](#8-color--theming)
9. [Micro-interactions](#9-micro-interactions)
10. [Responsive Design](#10-responsive-design)
11. [New shadcn/ui Components to Install](#11-new-shadcnui-components-to-install)

---

## 1. Layout & Navigation

### Current state
- No header, nav bar, or sidebar. The app renders page content directly inside `<body>` with no persistent chrome.
- Root layout (`src/app/layout.tsx`) only wraps children in `TRPCProvider`, `Toaster`, and `DevToolbar`.
- No breadcrumbs. The deal detail page uses a ghost "Back to Deals" button.
- The app title ("MCA Pilot") only appears in the `<title>` meta tag, never visually on screen.

### Proposed changes

#### 1a. Add a persistent top navigation header
- **What**: A full-width sticky header at the top containing the app logo/name, navigation links, and the current user's avatar + role badge.
- **Implementation**: Create `src/components/app-header.tsx`. Render it inside `layout.tsx` above `{children}`.
- **Structure**:
  ```
  [Logo: "MCA Pilot"] ---- [nav: Deals] ---- [Avatar + Name + Role badge]
  ```
- Use `<nav>` with a single link for now ("Deals"). This provides the skeleton for future pages (Dashboard, Reports, Settings).
- Sticky positioning: `fixed top-0 left-0 right-0 z-40 h-14 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80`.
- Add `pt-14` to the body or a wrapper div to offset for the fixed header.
- Pull the current user info from the same `/api/auth` fetch the DevToolbar already does. Share this state via a small React context (`src/lib/auth-context.tsx`) so both header and toolbar can consume it without duplicate fetches.
- Use the existing `Avatar` + `AvatarFallback` components (already installed at `src/components/ui/avatar.tsx`) for the user avatar showing initials.
- **Files**: `src/components/app-header.tsx` (new), `src/lib/auth-context.tsx` (new), `src/app/layout.tsx` (modified)
- **Priority**: Must-have

#### 1b. Add breadcrumbs to the deal detail page
- **What**: Replace the "Back to Deals" ghost button with a proper breadcrumb trail: `Deals / Merchant Name`.
- **Implementation**: Install shadcn `breadcrumb` component. Use it at the top of `src/app/deals/[id]/page.tsx`.
- The "Deals" segment links to `/deals`. The "Merchant Name" segment is non-interactive (current page).
- Remove the existing `<Button variant="ghost">` back link.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 1c. Constrain page width and center content consistently
- **What**: Both pages currently use different `max-w` values (`max-w-5xl` for list, `max-w-3xl` for detail). Standardize to `max-w-5xl` for both, so the detail page doesn't feel cramped compared to the list.
- **Files**: `src/app/deals/[id]/page.tsx` (change `max-w-3xl` to `max-w-5xl`)
- **Priority**: Nice-to-have

---

## 2. Deal List Page

### Current state
- Plain `<Table>` with 4 columns: Merchant Name, Amount, Status, Created.
- No search, filter, sort, or pagination controls.
- Loading state is a plain text string "Loading deals...".
- Empty state is a plain text string "No deals found."
- Rows are clickable (cursor-pointer) but have no visual affordance beyond the default `hover:bg-muted/50` from the Table component.
- No visible column indicating who the deal is assigned to.
- The deal count text ("8 deals") is in muted small text below the heading.

### Proposed changes

#### 2a. Add "Assigned To" column
- **What**: Add a 5th column showing the assigned user's name (or "Unassigned") using an `Avatar` + `AvatarFallback` with initials and the name text.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have (this is a CRM -- knowing who owns a deal is critical at a glance)

#### 2b. Add status filter tabs
- **What**: Horizontal filter tabs above the table grouped by segment: All | Intake | Submission | Negotiating | Closing | Funded | Dead. Clicking a tab filters the list client-side.
- **Implementation**: Use the shadcn `tabs` component (install via `npx shadcn@latest add tabs`). Filter `deals` array by segment before rendering the table.
- Show a count badge on each tab (e.g., "Intake (3)").
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have

#### 2c. Add a search input
- **What**: An `Input` with a `SearchIcon` positioned above the table (to the left of the "New Deal" button) that filters deals by merchant name client-side.
- **Implementation**: Use the existing `Input` component. Add `useState` for a search term. Filter `deals.filter(d => d.merchantName.toLowerCase().includes(term))`.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have

#### 2d. Improve the loading state
- **What**: Replace the "Loading deals..." text with a `Skeleton` component showing 5 placeholder table rows.
- **Implementation**: Install shadcn `skeleton` component. Create a `DealTableSkeleton` that renders 5 rows of rectangular skeletons matching the column widths.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have

#### 2e. Improve the empty state
- **What**: Replace the plain text empty state with a centered illustration-style empty state: a large muted icon (`InboxIcon` from lucide-react), a heading ("No deals yet"), a subtitle ("Create your first deal to get started"), and a CTA button.
- **Implementation**: Inline in the existing conditional branch.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have

#### 2f. Add row hover affordance
- **What**: Add a subtle right-arrow icon (`ChevronRightIcon`) in the last column that fades in on row hover to indicate clickability.
- **Implementation**: Add a new `<TableCell>` at the end of each row with `<ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />`. Add `group` class to the `<TableRow>`.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Nice-to-have

#### 2g. Sortable columns
- **What**: Make Amount and Created columns sortable by clicking the column header. Show a sort direction arrow icon.
- **Implementation**: Add `useState` for `sortField` and `sortDir`. Sort the deals array before rendering. Add `cursor-pointer` and arrow icons to the sortable `<TableHead>` elements.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Nice-to-have

---

## 3. Deal Detail Page

### Current state
- Single-column layout with a "Back" button, header (name + status badge + amount), a "Details" card, a "Status Transitions" card, a separator, and the Activity section.
- The Details card uses a 2-column `<dl>` grid with 6 fields (Email, Phone, Amount, Status, Created, Updated) plus Notes.
- Edit and Delete buttons are in the top-right corner.
- No assigned user information is displayed.
- The page maxes at `max-w-3xl`, which feels narrow.

### Proposed changes

#### 3a. Two-column layout for detail and activity
- **What**: On large screens, use a two-column layout: left column (wider, ~60%) for deal details + status transitions, right column (~40%) for the activity timeline. On mobile, stack vertically.
- **Implementation**: Wrap the content area in `<div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">`. Move the activity timeline into the right column.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 3b. Display assigned user prominently
- **What**: Show the assigned user in the deal header area, right next to the status badge. Use `Avatar` + `AvatarFallback` with the user's initials and name.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 3c. Redesign the Details card as a definition list with better visual hierarchy
- **What**: Instead of a flat 2-column grid, use a more structured layout:
  - Top section: Large merchant name as page title (already exists), status badge, amount in large text.
  - Contact info section: Email and phone as inline items with icons (`MailIcon`, `PhoneIcon`).
  - Metadata section: Created/Updated dates in smaller muted text at the bottom of the card.
  - Notes: Separate card or collapsible section if present.
- **Implementation**: Restructure the `<dl>` into semantic sections within the Card. Use lucide icons for contact info.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 3d. Improve the header action buttons
- **What**: Group Edit and Delete into a `DropdownMenu` accessed via a single "..." (ellipsis) icon button. This declutters the header, especially since Delete is a destructive action that shouldn't be equally prominent as Edit.
- **Implementation**: Use the existing `DropdownMenu` component (already installed). Replace the two buttons with a single `<Button variant="outline" size="icon-sm">` trigger containing `<MoreHorizontalIcon />`.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 3e. Add a deal amount hero display
- **What**: Make the requested amount visually prominent -- display it in a large font size (text-3xl font-bold) in the header area, not buried in the details grid.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Nice-to-have

---

## 4. Activity Timeline

### Current state
- Uses a vertical line + circle icon pattern. Each entry shows an icon, description text, timestamp, and an expandable "Metadata" JSON viewer.
- The icon circles are plain `border bg-background` with muted foreground icons.
- The metadata viewer shows raw JSON in a `<pre>` block.
- No actor name is displayed -- only `actorId` is available in the data.
- Timestamps show "Apr 3, 2:30 PM" format.

### Proposed changes

#### 4a. Color-code timeline icons by event type
- **What**: Give each event type a distinct background color for its circle:
  - `deal_created`: `bg-green-100 text-green-600` (or dark mode equivalent)
  - `status_changed`: `bg-blue-100 text-blue-600`
  - `deal_assigned`: `bg-purple-100 text-purple-600`
  - `deal_updated`: `bg-amber-100 text-amber-600`
  - `deal_deleted`: `bg-red-100 text-red-600`
- **Implementation**: Update the `EventIcon` component's parent `<div>` to accept a className based on event type. Create a `EVENT_TYPE_COLORS` map.
- **Files**: `src/components/activity-timeline.tsx`
- **Priority**: Must-have

#### 4b. Show actor name instead of actor ID
- **What**: The API should return the actor's name. Display it in the timeline entry as "Sarah Chen changed status from Lead to New Application" instead of just "Status changed from Lead to New Application".
- **Implementation**: This requires the `getActivity` tRPC procedure to join with the `users` table and return `actorName`. Then update the `eventDescription` function to incorporate the actor name.
- **Files**: `src/components/activity-timeline.tsx`, `src/server/services/deals.ts` or the tRPC router
- **Priority**: Must-have

#### 4c. Use relative timestamps
- **What**: Show "2 hours ago", "yesterday", "3 days ago" instead of absolute dates. Show the full absolute date on hover (via `title` attribute).
- **Implementation**: Use a small utility function that computes relative time (or install a lightweight library). Add `title={formatAbsoluteTimestamp(event.createdAt)}` for the tooltip.
- **Files**: `src/components/activity-timeline.tsx`
- **Priority**: Nice-to-have

#### 4d. Improve the metadata viewer
- **What**: Instead of raw JSON, render a structured "changes" view for `deal_updated` and `status_changed` events. Show a mini table: Field | Old Value | New Value. For other event types, keep the JSON viewer but with syntax highlighting.
- **Implementation**: Create a `MetadataChanges` sub-component that renders the `changes` array as a clean list with old/new values. Use `bg-red-50 line-through` for old values and `bg-green-50` for new values.
- **Files**: `src/components/activity-timeline.tsx`
- **Priority**: Nice-to-have

#### 4e. Add a "card" wrapper for the activity section
- **What**: Wrap the entire activity timeline in a `Card` component (matching the Details and Status Transitions cards) for visual consistency. Add a `CardHeader` with title "Activity" and an event count badge.
- **Files**: `src/app/deals/[id]/page.tsx`, potentially `src/components/activity-timeline.tsx`
- **Priority**: Must-have

---

## 5. Status Transitions

### Current state
- A card titled "Status Transitions" containing a `flex-wrap` row of outline buttons, one for each valid next status.
- All buttons look identical -- no visual distinction between forward-progress transitions and the "Dead" (terminal) transition.
- No visual indication of where the deal is in the overall pipeline.
- No confirmation for destructive transitions (moving to "Dead").

### Proposed changes

#### 5a. Add a visual pipeline/progress indicator
- **What**: Above the transition buttons, render a horizontal step indicator showing all 6 segments (Intake, Submission, Negotiating, Closing, Funded, Terminal) with the current segment highlighted. Completed segments show a checkmark.
- **Implementation**: Create `src/components/deal-pipeline.tsx`. Use a horizontal flex row of segments. Each segment is a small pill/step with the segment name. Use `DEAL_STATUSES` and `SEGMENT_COLORS` to determine which segment is current. Segments before the current one get a completed style (filled bg), the current one gets a ring/border highlight, and future ones are muted.
- **Structure**:
  ```
  [Intake] ---> [Submission] ---> [Negotiating] ---> [Closing] ---> [Funded]
     ^current
  ```
- If the deal is "Dead", show the full pipeline grayed out with a "Dead" badge overlay.
- **Files**: `src/components/deal-pipeline.tsx` (new), `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 5b. Distinguish forward vs. backward vs. terminal transitions
- **What**: Style the transition buttons differently:
  - Forward-progress transitions (e.g., "New Application", "Ready to Submit"): `variant="default"` (filled primary) to encourage forward movement.
  - Backward transitions (e.g., "Approved" back to "Ready to Submit"): `variant="outline"` with an undo-style icon.
  - Terminal "Dead" transition: `variant="destructive"` to clearly signal this is a negative action.
  - Resurrection "Lead" (from Dead): `variant="outline"` with a refresh icon.
- **Implementation**: In the transition button rendering loop, compare the index of the current status vs. the target status in `DEAL_STATUSES` to determine direction. If target is "dead", use destructive. If target index < current index, it's a backward transition.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 5c. Add confirmation dialog for "Dead" transitions
- **What**: Before transitioning to "Dead", show a confirmation dialog: "Are you sure you want to mark this deal as Dead? This will move it to the terminal state."
- **Implementation**: Add a small confirmation `Dialog` (reuse the same pattern as the delete confirmation dialog already on the page).
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 5d. Add transition labels/descriptions
- **What**: Show a small description below each transition button explaining what the transition means. For example, under "Ready to Submit": "All documents received, ready for lender submission".
- **Implementation**: Create a `TRANSITION_DESCRIPTIONS: Record<DealStatus, string>` map. Render the description as `<p className="text-xs text-muted-foreground">` under each button.
- **Files**: `src/app/deals/[id]/page.tsx` or `src/server/lib/status-machine.ts` for the descriptions map
- **Priority**: Nice-to-have

---

## 6. Dev Toolbar

### Current state
- Fixed to the bottom of the screen. Full-width, `border-t`, semi-transparent background with backdrop blur.
- Left side: "Dev Auth" label + current user info (name, role badge, workspace name).
- Right side: A `Select` dropdown (260px wide) to switch users, grouped by workspace.
- The toolbar has no visual indicator that it's a development-only tool.
- All pages have `pb-20` to avoid content being hidden behind the toolbar.

### Proposed changes

#### 6a. Add a visual "DEV MODE" indicator
- **What**: Add a bright colored banner or badge on the toolbar to make it unmistakably a dev tool. Use an orange/yellow accent stripe on the top border, and a "DEV" badge next to the "Dev Auth" label.
- **Implementation**: Change the `border-t` to `border-t-2 border-t-amber-500`. Add a `<Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px]">DEV</Badge>` next to the "Dev Auth" text.
- **Files**: `src/components/dev-toolbar.tsx`
- **Priority**: Must-have

#### 6b. Show role-colored indicator for current user
- **What**: Add a colored dot next to the current user's role badge that matches their role:
  - Admin: green dot
  - Team Leader: blue dot
  - Rep: gray dot
- **Implementation**: Add a `<span className="size-2 rounded-full bg-green-500">` (or appropriate color) before the role badge.
- **Files**: `src/components/dev-toolbar.tsx`
- **Priority**: Nice-to-have

#### 6c. Make toolbar collapsible
- **What**: Add a small toggle button (chevron icon) on the toolbar that collapses it to just a thin bar showing the current user name, freeing up screen space.
- **Implementation**: Add `useState` for collapsed state. When collapsed, only show a thin bar with user name and expand button. Animate with CSS transitions.
- **Files**: `src/components/dev-toolbar.tsx`
- **Priority**: Nice-to-have

#### 6d. Add workspace isolation indicator
- **What**: When switching between workspaces, briefly flash the page border or show a toast indicating which workspace is now active. This makes the multi-tenant isolation tangible during demos.
- **Implementation**: In the `switchUser` function, show a `toast.info("Switched to {workspaceName}")` before reloading.
- **Files**: `src/components/dev-toolbar.tsx`
- **Priority**: Nice-to-have

---

## 7. Typography & Spacing

### Current state
- Uses Geist Sans as the base font (set in `layout.tsx` as CSS variable `--font-geist-sans`).
- Page headings are `text-2xl font-semibold` (deal list title, deal detail merchant name).
- Section headings inside cards are `text-base font-medium` (via `CardTitle`).
- Body text is `text-sm` (default from the shadcn components).
- The deal list table cells use `p-2` padding.
- There is inconsistent vertical spacing: the deal list uses `py-8 pb-20`, detail page uses `py-8 pb-20`.
- The activity section heading is `text-lg font-semibold` -- a different level than other section headings.

### Proposed changes

#### 7a. Establish a consistent heading hierarchy
- **What**: Define and follow this hierarchy:
  - Page title: `text-2xl font-semibold tracking-tight` (e.g., "Deals", merchant name)
  - Section title: `text-lg font-semibold` (e.g., "Details", "Status Transitions", "Activity")
  - Card title: `text-base font-medium` (keep as-is from CardTitle)
  - Body: `text-sm` (keep as-is)
  - Caption/metadata: `text-xs text-muted-foreground`
- Add `tracking-tight` to the page titles for a more polished look.
- **Files**: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 7b. Increase table row height and padding
- **What**: The table feels dense. Increase cell padding from `p-2` to `px-4 py-3` for a more comfortable reading experience. This only requires overriding the `<TableCell>` className on each cell, or adjusting the base Table component.
- **Files**: `src/app/deals/page.tsx` (add className overrides on TableCell)
- **Priority**: Must-have

#### 7c. Standardize page container spacing
- **What**: Create a reusable page container pattern:
  ```tsx
  <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-20">
  ```
  Both pages should use identical container classes. Extract to a `PageContainer` component or just ensure consistency.
- **Files**: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 7d. Add spacing between the header action area and the content
- **What**: On the deal list page, the gap between the "Deals / New Deal" header row and the table/filter area should be `mb-8` instead of `mb-6` to give more breathing room.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Nice-to-have

---

## 8. Color & Theming

### Current state
- The app uses the default shadcn "base-nova" theme (from `globals.css`). All colors are achromatic (oklch with 0 chroma) -- essentially a black/white/gray palette with no brand color.
- Status badge colors use hardcoded Tailwind color classes (`bg-blue-100 text-blue-800`, etc.) that don't respect dark mode.
- The `SEGMENT_COLORS` map is duplicated in three files: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`, and `src/components/status-badge.tsx`.
- Dark mode variables exist in `globals.css` but no theme toggle is wired up (despite `next-themes` being a dependency).
- The destructive color is the only non-gray color in the theme tokens.

### Proposed changes

#### 8a. Add a brand accent color
- **What**: Replace the achromatic primary with a blue-tinted primary that gives the app identity. Suggested values (oklch):
  - Light mode `--primary`: `oklch(0.45 0.2 250)` (a professional dark blue)
  - Light mode `--primary-foreground`: `oklch(0.98 0 0)` (white)
  - Dark mode `--primary`: `oklch(0.65 0.18 250)` (lighter blue)
  - Dark mode `--primary-foreground`: `oklch(0.15 0 0)` (near-black)
- This will automatically affect all buttons, links, and other primary-colored components.
- **Files**: `src/app/globals.css`
- **Priority**: Must-have

#### 8b. Consolidate SEGMENT_COLORS to a single source of truth
- **What**: The `SEGMENT_COLORS` map and `StatusBadge` component are duplicated in 3 files. Use only the shared `src/components/status-badge.tsx` and import from there everywhere.
- Remove the local `SEGMENT_COLORS` and `StatusBadge` definitions from both `src/app/deals/page.tsx` and `src/app/deals/[id]/page.tsx`.
- **Files**: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`, `src/components/status-badge.tsx`
- **Priority**: Must-have

#### 8c. Make status badge colors dark-mode-aware
- **What**: The current hardcoded `bg-blue-100 text-blue-800` classes look broken in dark mode (light backgrounds on dark pages). Update `SEGMENT_COLORS` to include dark mode variants:
  ```ts
  Intake: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  Submission: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  // etc.
  ```
- **Files**: `src/components/status-badge.tsx`
- **Priority**: Must-have

#### 8d. Wire up dark mode toggle
- **What**: `next-themes` is already installed. Add a `ThemeProvider` in `layout.tsx` and a theme toggle button in the app header.
- **Implementation**:
  1. Wrap the `<html>` element with `suppressHydrationWarning`.
  2. Add `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` in layout.tsx.
  3. Add a `MoonIcon`/`SunIcon` toggle button in the app header.
- **Files**: `src/app/layout.tsx`, `src/components/app-header.tsx`
- **Priority**: Nice-to-have (but the infrastructure is already there)

---

## 9. Micro-interactions

### Current state
- Toast messages via `sonner` for success/error on mutations.
- Dialog open/close animations from shadcn (fade + zoom).
- Table rows have `hover:bg-muted/50` transition.
- No loading spinners on buttons during mutations (only text changes like "Creating..." / "Saving...").
- No skeleton loaders.
- No page transition animations.

### Proposed changes

#### 9a. Add spinner to mutation buttons
- **What**: When `isPending` is true on any mutation button, show a `LoaderCircle` spinning icon alongside the "Creating..." / "Saving..." text.
- **Implementation**: Import `LoaderCircleIcon` from lucide-react. When `isSubmitting`/`isPending`, prepend `<LoaderCircleIcon className="size-4 animate-spin" />` to the button text.
- **Files**: `src/components/deal-form.tsx`, `src/app/deals/[id]/page.tsx` (for status transition buttons, delete button)
- **Priority**: Must-have

#### 9b. Add skeleton loading for deal detail page
- **What**: The deal detail loading state is just "Loading..." text. Replace with skeleton placeholders matching the card layout.
- **Implementation**: Install shadcn `skeleton`. Create a `DealDetailSkeleton` with card-shaped skeletons.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 9c. Animate status badge changes
- **What**: When a status transition occurs on the deal detail page, briefly animate the status badge (flash/pulse) to draw attention to the change.
- **Implementation**: Add the Tailwind `animate-pulse` class to the StatusBadge for 1 second after a status mutation succeeds. Use a `useState` + `useEffect` with a timeout.
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Nice-to-have

#### 9d. Improve toast messages with more context
- **What**: Current toasts are generic ("Deal created", "Status updated"). Make them more specific:
  - "Deal created: Joe's Pizza"
  - "Status updated: Lead -> New Application"
  - "Deal archived: Joe's Pizza"
- **Implementation**: Pass more specific messages to `toast.success()` in the mutation `onSuccess` callbacks.
- **Files**: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`
- **Priority**: Nice-to-have

---

## 10. Responsive Design

### Current state
- Pages use `max-w-5xl` / `max-w-3xl` centered containers, which works fine on desktop.
- The table on the deal list page uses `overflow-x-auto` from the base Table component, which allows horizontal scroll on mobile.
- The dev toolbar select is hardcoded to `w-[260px]`, which may overflow on very small screens.
- The dialog max-width is `sm:max-w-lg` for deal forms and `sm:max-w-sm` for the base dialog, which is good.
- No explicit mobile-specific layouts or breakpoint handling.

### Proposed changes

#### 10a. Make the deal list a card-based layout on mobile
- **What**: On screens below `md`, replace the table with a card-based list where each deal is a card showing the merchant name, amount, status badge, and date. On `md` and above, keep the table.
- **Implementation**: Use a `hidden md:block` wrapper around the Table and a `md:hidden` wrapper around a card-based list. Each card is a `<div>` with border, padding, and the deal info stacked vertically.
- **Files**: `src/app/deals/page.tsx`
- **Priority**: Must-have

#### 10b. Make the dev toolbar responsive
- **What**: On mobile, collapse the toolbar to show just the current user avatar/name and a button that opens the user switcher in a sheet/drawer instead of a select dropdown.
- **Implementation**: Hide the full toolbar content on small screens. Show a compact version. Use the existing dialog pattern for the user switcher modal on mobile.
- **Files**: `src/components/dev-toolbar.tsx`
- **Priority**: Nice-to-have

#### 10c. Stack the deal detail header on mobile
- **What**: The header with merchant name + edit/delete buttons currently uses `flex items-start justify-between`, which can look cramped on mobile. Stack vertically on small screens:
  ```
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
  ```
- **Files**: `src/app/deals/[id]/page.tsx`
- **Priority**: Must-have

#### 10d. Add responsive padding to page containers
- **What**: Use `px-4 sm:px-6 lg:px-8` instead of just `px-4` for better use of space on larger screens.
- **Files**: `src/app/deals/page.tsx`, `src/app/deals/[id]/page.tsx`
- **Priority**: Nice-to-have

---

## 11. New shadcn/ui Components to Install

The following shadcn/ui components should be installed to support the improvements above:

| Component | Used For | Install Command |
|-----------|----------|-----------------|
| `skeleton` | Loading states (2d, 9b) | `npx shadcn@latest add skeleton` |
| `tabs` | Status filter tabs (2b) | `npx shadcn@latest add tabs` |
| `breadcrumb` | Deal detail breadcrumb (1b) | `npx shadcn@latest add breadcrumb` |
| `tooltip` | Relative time hover (4c), button hints | `npx shadcn@latest add tooltip` |

Components already installed and available:
- `avatar` -- for user displays (1a, 2a, 3b)
- `badge` -- for status badges, count badges
- `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `separator`, `table`, `textarea` -- all in use

---

## Implementation Order

Recommended implementation order to maximize visual impact with minimal risk:

### Phase 1: Foundation (do first)
1. **8b** -- Consolidate SEGMENT_COLORS (removes duplication, prerequisite for 8c)
2. **8a** -- Add brand accent color
3. **8c** -- Dark-mode-aware status badges
4. **7a** -- Heading hierarchy
5. **7c** -- Standardize page containers

### Phase 2: Navigation & Structure
6. **1a** -- App header with logo and user info
7. **1b** -- Breadcrumbs on detail page
8. **3a** -- Two-column detail layout
9. **3d** -- Dropdown menu for edit/delete actions

### Phase 3: Deal List Polish
10. **2b** -- Status filter tabs
11. **2c** -- Search input
12. **2a** -- Assigned To column
13. **2d** -- Skeleton loading states
14. **2e** -- Improved empty state
15. **10a** -- Mobile card layout for deal list

### Phase 4: Deal Detail & Transitions
16. **5a** -- Pipeline progress indicator
17. **5b** -- Differentiated transition buttons
18. **5c** -- Dead transition confirmation
19. **3b** -- Assigned user display
20. **3c** -- Redesigned details card
21. **4a** -- Color-coded timeline icons
22. **4b** -- Actor names in timeline
23. **4e** -- Card wrapper for activity

### Phase 5: Polish
24. **9a** -- Spinner on mutation buttons
25. **9b** -- Skeleton loading for detail page
26. **6a** -- Dev toolbar DEV indicator
27. **7b** -- Increased table padding
28. **10c** -- Responsive detail header
29. Remaining nice-to-haves as time permits

---

## Files Summary

| File | Changes |
|------|---------|
| `src/app/globals.css` | Brand colors (8a), dark mode tokens |
| `src/app/layout.tsx` | Add AppHeader, ThemeProvider, auth context |
| `src/app/deals/page.tsx` | Search, filter tabs, assigned column, loading/empty states, consolidate imports |
| `src/app/deals/[id]/page.tsx` | Two-column layout, breadcrumbs, pipeline indicator, dropdown actions, responsive |
| `src/components/status-badge.tsx` | Dark mode colors, single source of truth |
| `src/components/activity-timeline.tsx` | Colored icons, actor names, metadata viewer |
| `src/components/deal-form.tsx` | Spinner on submit button |
| `src/components/dev-toolbar.tsx` | DEV indicator, collapsible, responsive |
| `src/components/app-header.tsx` | **New** -- Top navigation header |
| `src/components/deal-pipeline.tsx` | **New** -- Visual pipeline/progress indicator |
| `src/lib/auth-context.tsx` | **New** -- Shared auth state context |
