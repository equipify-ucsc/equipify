/* ==========================================================================
   Equipify — Freelance Worker / Complaints

   Covers both complaint requirements: submitting one against a customer, and
   tracking it afterwards. The complaint form and the "My complaints" list are
   the same for every role: see shared/complaints.js (UI) and
   shared/complaints-api.js (data, over the API). There is no complaints table
   yet, so the rows are served from backend/fixtures/complaints.json — but the
   page only ever sees the API, so nothing here changes when the table lands.
   ========================================================================== */

EquipifyComplaints.initPage();
