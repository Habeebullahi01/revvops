// Shared test-data housekeeping for the browser flow checks.
//
// Every flow check seeds a customer + vehicle + invoice + job order + payment
// through the service role, drives the UI, then has to remove exactly those
// rows. They all need the same child-first delete order and the same audit-log
// sweep, and getting it subtly wrong leaks rows that break the next run (a
// stale plate trips vehicles_license_plate_key → 23505).
//
// The service role is used deliberately here: cleanup must not depend on any
// role's RLS rights, and every row was created by the suite itself.
//
//   const { purgeCustomers, purger } = await import("./lib/flow-cleanup.mjs");
//   const cleanup = purger({ customers: [created] });   // call at the end
//
// Rows left by an older, crashed run can be cleared with `--purge` in the
// individual check (each one wires its own filters to `purgeCustomers`).

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}` });

export const canPurge = () => Boolean(URL_ && SERVICE);

export async function restGet(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) {
    console.log(`      could not read ${path}: ${res.status} ${String(await res.text()).slice(0, 140)}`);
    return [];
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

export async function restDelete(table, filter) {
  const res = await fetch(`${URL_}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...headers(), Prefer: "return=minimal" },
  });
  if (!res.ok) {
    const body = String(await res.text()).slice(0, 140);
    console.log(`      could not clear ${table}: ${res.status} ${body}`);
  }
  return res.ok;
}

export const idList = (ids) => `(${ids.map((id) => `"${id}"`).join(",")})`;

/**
 * Delete everything belonging to the given customers, children first:
 * receipts → payments → invoices → job orders → service history → vehicles →
 * customer → audit logs.
 *
 * Vehicles and invoices cascade from the customer, but job orders reference the
 * customer *without* a cascade, so they must go before it. service_history has
 * no cascade from a job order either, hence its explicit delete.
 *
 * Returns a count summary, or null when there was nothing to do / no credentials.
 */
export async function purgeCustomers(customers) {
  const ids = (customers || []).map((c) => c?.id).filter(Boolean);
  if (!ids.length || !canPurge()) return null;

  const vehicles = await restGet(`vehicles?select=id&customer_id=in.${idList(ids)}`);
  const invoices = await restGet(`invoices?select=id&customer_id=in.${idList(ids)}`);
  const jobs = await restGet(`job_orders?select=id&customer_id=in.${idList(ids)}`);
  const vehicleIds = vehicles.map((v) => v.id);
  const invoiceIds = invoices.map((i) => i.id);
  const jobIds = jobs.map((j) => j.id);

  // Payments point at an invoice OR a job order, so both branches are needed.
  const paymentFilter = [
    invoiceIds.length ? `invoice_id.in.${idList(invoiceIds)}` : null,
    jobIds.length ? `job_order_id.in.${idList(jobIds)}` : null,
  ].filter(Boolean);

  if (paymentFilter.length) {
    const filter = `or=(${paymentFilter.join(",")})`;
    const pays = await restGet(`payments?select=id&${filter}`);
    const payIds = pays.map((p) => p.id);
    // Receipts are append-only under RLS, but cleanup runs as the service role.
    if (payIds.length) await restDelete("receipts", `payment_id=in.${idList(payIds)}`);
    await restDelete("payments", filter);
  }

  if (invoiceIds.length) await restDelete("invoices", `customer_id=in.${idList(ids)}`);
  if (jobIds.length) {
    await restDelete("service_history", `linked_job_order_id=in.${idList(jobIds)}`);
    await restDelete("job_logs", `job_order_id=in.${idList(jobIds)}`);
    await restDelete("job_orders", `customer_id=in.${idList(ids)}`);
  }
  if (vehicleIds.length) await restDelete("vehicles", `customer_id=in.${idList(ids)}`);
  await restDelete("customers", `id=in.${idList(ids)}`);

  // Audit rows reference the entity by id and are not cascaded. Some entries
  // record the customer id only inside `details`, so sweep both shapes.
  const auditIds = [...ids, ...invoiceIds, ...jobIds, ...vehicleIds];
  if (auditIds.length) await restDelete("audit_logs", `entity_id=in.${idList(auditIds)}`);
  for (const id of ids) {
    await restDelete("audit_logs", `details->>customer_id=eq.${id}`);
  }

  return {
    customers: ids.length,
    vehicles: vehicleIds.length,
    invoices: invoiceIds.length,
    jobs: jobIds.length,
  };
}

/**
 * Wrap `purgeCustomers` with the KEEP_TEST_DATA escape hatch every check
 * honours, so the three flow checks clean up identically.
 */
export function purger() {
  const keep = process.env.KEEP_TEST_DATA === "1";
  return async (customers) => {
    if (keep) {
      console.log("\nKEEP_TEST_DATA=1 — left this run's rows in place.");
      return null;
    }
    return purgeCustomers(customers);
  };
}
