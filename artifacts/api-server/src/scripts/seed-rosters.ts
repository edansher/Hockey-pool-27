// Independent copy: loads the nine original draft boards into an EMPTY copy
// database (the same idempotent insert the API performs on first request).
// Never point DATABASE_URL at the original app's database.
import { pool } from "@workspace/db";
import { loadDraftRosters } from "../lib/draft-roster-store";

const rows = await loadDraftRosters();
console.log(`Draft rosters ready: ${rows.map(row => `${row.id} (${row.selections.length})`).join(", ")}`);
await pool.end();
