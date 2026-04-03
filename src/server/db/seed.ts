import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  workspaces,
  users,
  teams,
  teamMemberships,
  deals,
  eventLog,
} from "./schema";

const connectionString = process.env.DATABASE_URL_MIGRATION;
if (!connectionString) {
  throw new Error("DATABASE_URL_MIGRATION is not set in .env");
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

type DealStatus =
  | "lead"
  | "new_application"
  | "missing_documents"
  | "ready_to_submit"
  | "submitted"
  | "approved"
  | "offer_accepted"
  | "funded"
  | "dead";

interface DealSeed {
  merchantName: string;
  merchantEmail: string;
  merchantPhone: string;
  requestedAmount: string;
  status: DealStatus;
  notes: string | null;
}

async function seed() {
  console.log("Seeding database...\n");

  // ─── Clear existing data (respecting FK order) ──────────────────────────────
  console.log("Clearing existing data...");
  await db.delete(eventLog);
  await db.delete(deals);
  await db.delete(teamMemberships);
  await db.delete(teams);
  await db.delete(users);
  await db.delete(workspaces);
  console.log("All tables cleared.\n");

  // ═══════════════════════════════════════════════════════════════════════════════
  // WORKSPACE A — Apex Funding Brokers
  // ═══════════════════════════════════════════════════════════════════════════════

  const [workspaceA] = await db
    .insert(workspaces)
    .values({ name: "Apex Funding Brokers" })
    .returning();

  console.log(`Created workspace: ${workspaceA.name} (${workspaceA.id})`);

  // Users
  const [sarah] = await db
    .insert(users)
    .values({
      workspaceId: workspaceA.id,
      name: "Sarah Chen",
      email: "sarah@apexfunding.com",
      role: "admin",
    })
    .returning();

  const [marcus] = await db
    .insert(users)
    .values({
      workspaceId: workspaceA.id,
      name: "Marcus Johnson",
      email: "marcus@apexfunding.com",
      role: "team_leader",
    })
    .returning();

  const [emily] = await db
    .insert(users)
    .values({
      workspaceId: workspaceA.id,
      name: "Emily Rodriguez",
      email: "emily@apexfunding.com",
      role: "rep",
    })
    .returning();

  const [jake] = await db
    .insert(users)
    .values({
      workspaceId: workspaceA.id,
      name: "Jake Thompson",
      email: "jake@apexfunding.com",
      role: "rep",
    })
    .returning();

  console.log(
    `  Users: ${sarah.name} (admin), ${marcus.name} (team_leader), ${emily.name} (rep), ${jake.name} (rep)`,
  );

  // Team
  const [salesTeamAlpha] = await db
    .insert(teams)
    .values({
      workspaceId: workspaceA.id,
      name: "Sales Team Alpha",
    })
    .returning();

  await db.insert(teamMemberships).values([
    { teamId: salesTeamAlpha.id, userId: marcus.id },
    { teamId: salesTeamAlpha.id, userId: emily.id },
    { teamId: salesTeamAlpha.id, userId: jake.id },
  ]);

  console.log(
    `  Team: ${salesTeamAlpha.name} (Marcus, Emily, Jake)\n`,
  );

  // Deals for Workspace A
  const workspaceADeals: (DealSeed & { assignedUserId: string })[] = [
    // 2 Leads
    {
      merchantName: "Mario's Pizza",
      merchantEmail: "mario@mariospizza.com",
      merchantPhone: "(212) 555-0101",
      requestedAmount: "75000.00",
      status: "lead",
      notes: "Referred by existing client. Interested in expansion funding.",
      assignedUserId: emily.id,
    },
    {
      merchantName: "Bay Area Auto Repair",
      merchantEmail: "service@bayareauto.com",
      merchantPhone: "(415) 555-0202",
      requestedAmount: "120000.00",
      status: "lead",
      notes: "Cold outreach. Needs equipment financing.",
      assignedUserId: jake.id,
    },
    // 1 New Application
    {
      merchantName: "Sunshine Laundry",
      merchantEmail: "info@sunshinelaundry.com",
      merchantPhone: "(305) 555-0303",
      requestedAmount: "45000.00",
      status: "new_application",
      notes: "Application received. Awaiting bank statements.",
      assignedUserId: emily.id,
    },
    // 1 Missing Documents
    {
      merchantName: "Golden Dragon Restaurant",
      merchantEmail: "owner@goldendragon.com",
      merchantPhone: "(718) 555-0404",
      requestedAmount: "200000.00",
      status: "missing_documents",
      notes: "Missing last 3 months bank statements and tax return.",
      assignedUserId: jake.id,
    },
    // 1 Ready to Submit
    {
      merchantName: "Peak Performance Gym",
      merchantEmail: "admin@peakperformancegym.com",
      merchantPhone: "(312) 555-0505",
      requestedAmount: "150000.00",
      status: "ready_to_submit",
      notes: "All docs verified. Ready for lender submission.",
      assignedUserId: emily.id,
    },
    // 1 Submitted
    {
      merchantName: "Bella's Boutique",
      merchantEmail: "bella@bellasboutique.com",
      merchantPhone: "(404) 555-0606",
      requestedAmount: "85000.00",
      status: "submitted",
      notes: "Submitted to 3 lenders. Awaiting offers.",
      assignedUserId: jake.id,
    },
    // 1 Approved
    {
      merchantName: "Metro Plumbing Services",
      merchantEmail: "dispatch@metroplumbing.com",
      merchantPhone: "(214) 555-0707",
      requestedAmount: "250000.00",
      status: "approved",
      notes: "Approved by Rapid Capital at 1.35 factor rate.",
      assignedUserId: emily.id,
    },
    // 1 Offer Accepted
    {
      merchantName: "TechFix Solutions",
      merchantEmail: "support@techfixsolutions.com",
      merchantPhone: "(512) 555-0808",
      requestedAmount: "180000.00",
      status: "offer_accepted",
      notes: "Merchant accepted $180k offer. Contracts being prepared.",
      assignedUserId: jake.id,
    },
    // 1 Funded
    {
      merchantName: "Harbor View Dental",
      merchantEmail: "office@harborviewdental.com",
      merchantPhone: "(619) 555-0909",
      requestedAmount: "350000.00",
      status: "funded",
      notes: "Funded $350k on 03/15. 12-month term.",
      assignedUserId: emily.id,
    },
    // 1 Dead
    {
      merchantName: "Quick Stop Convenience",
      merchantEmail: "qs@quickstop.com",
      merchantPhone: "(713) 555-1010",
      requestedAmount: "30000.00",
      status: "dead",
      notes: "Merchant unresponsive after 3 follow-up attempts.",
      assignedUserId: jake.id,
    },
  ];

  const insertedDealsA = await db
    .insert(deals)
    .values(
      workspaceADeals.map((d) => ({
        workspaceId: workspaceA.id,
        assignedUserId: d.assignedUserId,
        merchantName: d.merchantName,
        merchantEmail: d.merchantEmail,
        merchantPhone: d.merchantPhone,
        requestedAmount: d.requestedAmount,
        status: d.status,
        notes: d.notes,
      })),
    )
    .returning();

  // Event log entries for Workspace A deals
  await db.insert(eventLog).values(
    insertedDealsA.map((deal) => {
      const seedDeal = workspaceADeals.find(
        (d) => d.merchantName === deal.merchantName,
      )!;
      return {
        workspaceId: workspaceA.id,
        dealId: deal.id,
        actorId: seedDeal.assignedUserId,
        eventType: "deal_created" as const,
        metadata: {
          merchantName: deal.merchantName,
          requestedAmount: deal.requestedAmount,
          status: deal.status,
        },
      };
    }),
  );

  console.log(`  Deals created: ${insertedDealsA.length}`);
  for (const deal of insertedDealsA) {
    const assignee =
      deal.assignedUserId === emily.id ? "Emily" : "Jake";
    console.log(
      `    - ${deal.merchantName} [${deal.status}] → ${assignee}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // WORKSPACE B — Summit Capital Group
  // ═══════════════════════════════════════════════════════════════════════════════

  const [workspaceB] = await db
    .insert(workspaces)
    .values({ name: "Summit Capital Group" })
    .returning();

  console.log(`\nCreated workspace: ${workspaceB.name} (${workspaceB.id})`);

  const [david] = await db
    .insert(users)
    .values({
      workspaceId: workspaceB.id,
      name: "David Park",
      email: "david@summitcapital.com",
      role: "admin",
    })
    .returning();

  const [lisa] = await db
    .insert(users)
    .values({
      workspaceId: workspaceB.id,
      name: "Lisa Wang",
      email: "lisa@summitcapital.com",
      role: "rep",
    })
    .returning();

  console.log(`  Users: ${david.name} (admin), ${lisa.name} (rep)`);

  // Deals for Workspace B
  const workspaceBDeals: (DealSeed & { assignedUserId: string })[] = [
    {
      merchantName: "Riverside Coffee Roasters",
      merchantEmail: "hello@riversidecoffee.com",
      merchantPhone: "(503) 555-2001",
      requestedAmount: "65000.00",
      status: "lead",
      notes: "New lead from website inquiry.",
      assignedUserId: lisa.id,
    },
    {
      merchantName: "Urban Fitness Studio",
      merchantEmail: "info@urbanfitness.com",
      merchantPhone: "(206) 555-2002",
      requestedAmount: "110000.00",
      status: "submitted",
      notes: "Submitted to 2 lenders. Strong bank statements.",
      assignedUserId: lisa.id,
    },
    {
      merchantName: "Greenleaf Landscaping",
      merchantEmail: "jobs@greenleaflandscaping.com",
      merchantPhone: "(971) 555-2003",
      requestedAmount: "480000.00",
      status: "funded",
      notes: "Funded $480k on 03/20. Equipment purchase for spring season.",
      assignedUserId: lisa.id,
    },
  ];

  const insertedDealsB = await db
    .insert(deals)
    .values(
      workspaceBDeals.map((d) => ({
        workspaceId: workspaceB.id,
        assignedUserId: d.assignedUserId,
        merchantName: d.merchantName,
        merchantEmail: d.merchantEmail,
        merchantPhone: d.merchantPhone,
        requestedAmount: d.requestedAmount,
        status: d.status,
        notes: d.notes,
      })),
    )
    .returning();

  // Event log entries for Workspace B deals
  await db.insert(eventLog).values(
    insertedDealsB.map((deal) => ({
      workspaceId: workspaceB.id,
      dealId: deal.id,
      actorId: lisa.id,
      eventType: "deal_created" as const,
      metadata: {
        merchantName: deal.merchantName,
        requestedAmount: deal.requestedAmount,
        status: deal.status,
      },
    })),
  );

  console.log(`  Deals created: ${insertedDealsB.length}`);
  for (const deal of insertedDealsB) {
    console.log(`    - ${deal.merchantName} [${deal.status}] → Lisa`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("  SEED COMPLETE");
  console.log("══════════════════════════════════════════");
  console.log(`  Workspace A: "${workspaceA.name}"`);
  console.log(`    Users: 4 (1 admin, 1 team_leader, 2 reps)`);
  console.log(`    Teams: 1`);
  console.log(`    Deals: ${insertedDealsA.length}`);
  console.log(`  Workspace B: "${workspaceB.name}"`);
  console.log(`    Users: 2 (1 admin, 1 rep)`);
  console.log(`    Teams: 0`);
  console.log(`    Deals: ${insertedDealsB.length}`);
  console.log(`  Total event log entries: ${insertedDealsA.length + insertedDealsB.length}`);
  console.log("══════════════════════════════════════════\n");

  // Close the connection
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
