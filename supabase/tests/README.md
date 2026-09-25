# Tests

Run with `supabase test db` (needs Docker — this only works where `supabase
start` can run, e.g. GitHub Actions' `ubuntu-latest` runners or a developer
machine with Docker; it cannot run from the network-restricted sandbox this
backend was originally built in).

- `database/get_open_slots.test.sql` — slot generation, including across the
  UK's autumn 2026 clock change (25 Oct), and that an existing booking
  correctly removes just that slot.
- `database/rls.test.sql` — anon can't read bookings; a parent can't read
  another family's student records.

## The double-booking race

The requirement ("two parallel requests for one slot → exactly one
succeeds") isn't something a pgTAP test can exercise meaningfully — pgTAP
runs sequentially inside one transaction. The actual guarantee is the
`bookings_no_staff_overlap` exclusion constraint in
`migrations/0001_init.sql`: Postgres enforces it atomically at commit time
for *any* two overlapping inserts for the same staff member, concurrent or
not, application-level "is it free?" check or not. `book-admissions-call`
relies on this — it just re-checks first for a friendlier error message, and
catches the `23P01` (exclusion_violation) Postgres error code to return
`slot_taken` if the constraint still catches a genuine race.

To verify by hand once deployed: open two terminals, run the same `insert
into bookings (...)` for the same staff member and an overlapping time range
in both at once (e.g. via `psql`) — exactly one succeeds, the other errors
with `23P01`.
