/* ==========================================================================
   Equipify — Messages & notifications data layer (UI only, mock data)
   Exposes window.EquipifyInbox.

   Messaging and notifications have no tables or endpoints yet, so every role's
   Messages and Notifications pages, and the unread badges in every sidenav and
   topbar, read from this one file. Each method resolves with the same
   {ok, status, data, error, fields} shape EquipifyApi does, and the rows use
   the field names of the freelancer placeholder endpoints
   (FreelanceWorkerMockController), so when the real API exists this file is
   the only thing that changes: each method becomes an EquipifyApi call.

   The signed-in role comes from <body data-require-auth="…"> (or
   data-inbox-role on the public Customer pages). Each role has its own seed
   data, and whatever the user changes (messages sent, conversations started,
   things marked read) is kept in localStorage under that role, so a badge
   cleared on one page stays cleared on the next. If storage is unavailable
   the seed is used and changes last until the page is left.

   RULES is who may START a conversation with whom. Replying in a
   conversation you are already part of is always allowed; that is how a
   technician answers an admin, for example. The backend must enforce the
   same table when it is built.
   ========================================================================== */

(function () {
  'use strict';

  var STORAGE_PREFIX = 'equipify.inbox.v1.';
  var MAX_MESSAGE_LENGTH = 2000;

  var ROLE_LABELS = {
    customer: 'Customer',
    renting_party: 'Renting party',
    freelance_worker: 'Freelance worker',
    maintenance_tech: 'Technician',
    delivery_personnel: 'Delivery personnel',
    area_manager: 'Area manager',
    admin: 'Admin'
  };

  // Who each role may start a new conversation with.
  var RULES = {
    customer: ['renting_party', 'freelance_worker', 'delivery_personnel', 'area_manager'],
    renting_party: ['customer', 'maintenance_tech', 'delivery_personnel', 'area_manager'],
    freelance_worker: ['customer'],
    maintenance_tech: ['renting_party', 'area_manager'],
    delivery_personnel: ['customer', 'renting_party', 'area_manager'],
    area_manager: ['delivery_personnel', 'customer', 'maintenance_tech', 'renting_party', 'admin'],
    admin: ['customer', 'renting_party', 'freelance_worker', 'maintenance_tech', 'delivery_personnel', 'area_manager']
  };

  // Notification types per role: the filter options, the feed icon and its
  // colour (a badge-status tone: active, pending, completed, rejected, draft). The
  // freelance worker's are listed for completeness; its own pages still read
  // the /freelancer placeholder endpoints.
  var NOTIFICATION_TYPES = {
    customer: [
      { value: 'rental', label: 'Rentals', icon: 'construction', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'job', label: 'Jobs & bids', icon: 'work', tone: 'active' },
      { value: 'delivery', label: 'Deliveries', icon: 'local_shipping', tone: 'active' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    renting_party: [
      { value: 'rental', label: 'Rental requests', icon: 'receipt_long', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'maintenance', label: 'Maintenance', icon: 'build', tone: 'pending' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    admin: [
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' },
      { value: 'verification', label: 'Verifications', icon: 'fact_check', tone: 'pending' },
      { value: 'system', label: 'System', icon: 'info', tone: 'draft' }
    ],
    maintenance_tech: [
      { value: 'appointment', label: 'Appointments', icon: 'event', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    delivery_personnel: [
      { value: 'assignment', label: 'Assignments', icon: 'local_shipping', tone: 'active' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    area_manager: [
      { value: 'delivery', label: 'Delivery requests', icon: 'local_shipping', tone: 'active' },
      { value: 'alert', label: 'Delays & issues', icon: 'warning', tone: 'pending' },
      { value: 'complaint', label: 'Complaints', icon: 'flag', tone: 'rejected' }
    ],
    freelance_worker: [
      { value: 'job', label: 'Jobs', icon: 'work', tone: 'active' },
      { value: 'bid', label: 'Bids', icon: 'gavel', tone: 'pending' },
      { value: 'payment', label: 'Payments', icon: 'payments', tone: 'completed' }
    ]
  };

  // ---------- Directory: everyone a role might find with "New message" ----------
  var PEOPLE = [
    { person_id: 'c1', name: 'Kasun Perera', role: 'customer', detail: 'Perera Constructions · Colombo' },
    { person_id: 'c2', name: 'Nimali Fernando', role: 'customer', detail: 'Fernando Events · Negombo' },
    { person_id: 'c3', name: 'Ruwan Jayasinghe', role: 'customer', detail: 'Jayasinghe Builders · Kandy' },
    { person_id: 'c4', name: 'Dilani Wickramasinghe', role: 'customer', detail: 'Green Acre Farms · Kurunegala' },
    { person_id: 'c5', name: 'Chamara Silva', role: 'customer', detail: 'Silva Road Works · Galle' },
    { person_id: 'c6', name: 'Tharindu Bandara', role: 'customer', detail: 'Bandara Landscaping · Gampaha' },

    { person_id: 'r1', name: 'Lanka Heavy Hire (Pvt) Ltd', role: 'renting_party', detail: 'Colombo' },
    { person_id: 'r2', name: 'Colombo Equip Rentals', role: 'renting_party', detail: 'Colombo' },
    { person_id: 'r3', name: 'Kandy Plant & Machinery', role: 'renting_party', detail: 'Kandy' },
    { person_id: 'r4', name: 'Southern Crane Services', role: 'renting_party', detail: 'Galle' },
    { person_id: 'r5', name: 'Negombo Tools Hub', role: 'renting_party', detail: 'Negombo' },

    { person_id: 'f1', name: 'Sunil Rathnayake', role: 'freelance_worker', detail: 'Excavator operator · Colombo' },
    { person_id: 'f2', name: 'Pradeep Kumara', role: 'freelance_worker', detail: 'Crane operator · Kandy' },
    { person_id: 'f3', name: 'Anura Dissanayake', role: 'freelance_worker', detail: 'Forklift operator · Gampaha' },
    { person_id: 'f4', name: 'Mahesh Gunawardena', role: 'freelance_worker', detail: 'Backhoe operator · Galle' },

    { person_id: 't1', name: 'Nuwan Herath', role: 'maintenance_tech', detail: 'Hydraulics · Colombo' },
    { person_id: 't2', name: 'Asanka Weerasinghe', role: 'maintenance_tech', detail: 'Diesel engines · Kandy' },
    { person_id: 't3', name: 'Lahiru Madushanka', role: 'maintenance_tech', detail: 'Generators & electrical · Galle' },

    { person_id: 'd1', name: 'Saman Priyantha', role: 'delivery_personnel', detail: 'Colombo region' },
    { person_id: 'd2', name: 'Janaka Ekanayake', role: 'delivery_personnel', detail: 'Kandy region' },
    { person_id: 'd3', name: 'Roshan Abeysekara', role: 'delivery_personnel', detail: 'Colombo region' },
    { person_id: 'd4', name: 'Iresha Samarasinghe', role: 'delivery_personnel', detail: 'Galle region' },

    { person_id: 'm1', name: 'Dinesh Karunaratne', role: 'area_manager', detail: 'Colombo region' },
    { person_id: 'm2', name: 'Harsha Liyanage', role: 'area_manager', detail: 'Kandy region' },
    { person_id: 'm3', name: 'Shanika Mendis', role: 'area_manager', detail: 'Galle region' },

    { person_id: 'a1', name: 'Amaya Gunasekara', role: 'admin', detail: 'Equipify support team' }
  ];

  // ---------- Seed data per role ----------
  // A conversation: who with, what it is about, and its messages oldest first
  // as [sender, body, minutes ago]. `unread` is how many of the newest
  // messages from them have not been read yet.
  // A notification: [type, title, body, minutes ago, link or null]. The first
  // `unread` notifications (the newest) start unread.
  var H = 60;
  var D = 24 * H;

  var SEED = {
    customer: {
      conversations: [
        { with: 'r1', ref: 'RR-1042 · CAT 320 Excavator', unread: 2, thread: [
          ['me', 'Hi, I placed a rental request for the CAT 320 from 3 to 7 October. Is it available for the full period?', 26 * H],
          ['them', 'Hello, yes it is free for those dates. We will confirm the request today.', 25 * H],
          ['me', 'Great. The site is in Kaduwela, is there space needed for the delivery truck to turn?', 24 * H],
          ['them', 'A 12 m clear stretch is enough. The platform driver will call you the day before.', 50],
          ['them', 'Request accepted. Please complete the payment by tomorrow night.', 35]
        ] },
        { with: 'f1', ref: 'JB-2031 · Excavator operator', unread: 1, thread: [
          ['them', 'Good morning. I bid on your excavation job in Kaduwela. I have 9 years on CAT and Komatsu machines.', 2 * D],
          ['me', 'Thanks Sunil. Can you start at 7.30 each day?', 2 * D - 3 * H],
          ['them', 'Yes, 7.30 is fine. I will bring my own safety gear.', 3 * H]
        ] },
        { with: 'd1', ref: 'DL-311 · Delivery to Kaduwela', unread: 0, thread: [
          ['them', 'I am on the way with the generator. ETA 40 minutes.', 4 * D],
          ['me', 'Thanks. Ask for Mr. Silva at the gate.', 4 * D - 10],
          ['them', 'Delivered and signed off. Have a good day.', 4 * D - 2 * H]
        ] },
        { with: 'r3', ref: 'RR-0998 · Mobile crane 25T', unread: 0, thread: [
          ['me', 'Could you share the load chart for the 25 T crane before I confirm?', 6 * D],
          ['them', 'Sure, it is in the listing photos now. Max 25 T at 3 m radius.', 6 * D - 2 * H],
          ['me', 'Got it, thank you.', 6 * D - 3 * H]
        ] },
        { with: 'm1', ref: 'DL-305 · Delivery delay', unread: 0, thread: [
          ['them', 'Your delivery DL-305 is delayed by about two hours due to a road closure in Kelaniya. Sorry for the trouble.', 9 * D],
          ['me', 'Understood, thanks for letting me know.', 9 * D - 20]
        ] },
        { with: 'a1', ref: 'CP-88 · Complaint review', unread: 0, thread: [
          ['them', 'Hello, I am reviewing your complaint CP-88 about the damaged tent. Could you send the photos you took at handover?', 12 * D],
          ['me', 'Yes, I have added them to the complaint.', 12 * D - H],
          ['them', 'Thank you. We will update you within two working days.', 12 * D - 2 * H]
        ] }
      ],
      notifications: { unread: 4, items: [
        ['rental', 'Rental request accepted', 'RR-1042 · CAT 320 Excavator · Lanka Heavy Hire (Pvt) Ltd. Pay by 23:59 tomorrow.', 35, '../Rental History/index.html'],
        ['job', 'New bid on your job', 'JB-2031 · Excavator operator · Sunil Rathnayake bid LKR 85,000.', 3 * H, '../Job History/index.html'],
        ['job', 'New bid on your job', 'JB-2031 · Excavator operator · Mahesh Gunawardena bid LKR 92,000.', 5 * H, '../Job History/index.html'],
        ['delivery', 'Delivery scheduled', 'DL-318 · Diesel generator 60 kVA arrives on 2 Oct between 8.00 and 12.00.', 9 * H, '../Rental History/index.html'],
        ['payment', 'Payment received', 'RR-1027 · LKR 48,000 paid. Your invoice is ready.', D + 2 * H, '../Rental History/index.html'],
        ['rental', 'Rental request declined', 'RR-1031 · Scissor lift · Colombo Equip Rentals could not take this booking.', 2 * D, '../Rental History/index.html'],
        ['complaint', 'Complaint resolved', 'CP-88 · A partial refund of LKR 6,500 was approved.', 3 * D, null],
        ['delivery', 'Delivered', 'DL-311 · Diesel generator 60 kVA was delivered to Kaduwela.', 4 * D, '../Rental History/index.html'],
        ['rental', 'Rental starts tomorrow', 'RR-1019 · Vibratory roller · pickup confirmed for 07:30.', 5 * D, '../Rental History/index.html'],
        ['job', 'Job completed', 'JB-1990 · Forklift operator · marked completed. Rate Anura Dissanayake.', 6 * D, '../Job History/index.html'],
        ['payment', 'Refund processed', 'RR-0990 · LKR 12,000 returned to your card.', 8 * D, '../Rental History/index.html'],
        ['rental', 'Payment deadline missed', 'RR-0985 · Concrete mixer · the request was cancelled.', 10 * D, '../Rental History/index.html'],
        ['complaint', 'Complaint under review', 'CP-88 · An admin is now reviewing your complaint.', 12 * D, null]
      ] }
    },

    renting_party: {
      conversations: [
        { with: 'c1', ref: 'RR-1042 · CAT 320 Excavator', unread: 1, thread: [
          ['them', 'Hi, I placed a rental request for the CAT 320 from 3 to 7 October. Is it available for the full period?', 26 * H],
          ['me', 'Hello Kasun, yes it is free for those dates. We will confirm the request today.', 25 * H],
          ['them', 'Great. The site is in Kaduwela, is there space needed for the delivery truck to turn?', 24 * H],
          ['me', 'A 12 m clear stretch is enough. The platform driver will call you the day before.', 50],
          ['them', 'Perfect, I will make the payment tonight.', 20]
        ] },
        { with: 't1', ref: 'Hydraulic leak · JCB 3CX', unread: 2, thread: [
          ['me', 'Our JCB 3CX has a slow hydraulic leak on the boom cylinder. Are you free this week?', D],
          ['them', 'I can come on Thursday morning. Please keep the machine at your Peliyagoda yard.', 6 * H],
          ['them', 'I will bring replacement seals, so no need to buy anything.', 5 * H]
        ] },
        { with: 'd3', ref: 'DL-322 · Pickup from Peliyagoda', unread: 0, thread: [
          ['them', 'I will collect the scissor lift at 9.00 tomorrow for delivery DL-322.', 2 * D],
          ['me', 'OK, the yard supervisor will have it ready at gate 2.', 2 * D - 30]
        ] },
        { with: 'm1', ref: 'Delivery pickups · Colombo', unread: 0, thread: [
          ['me', 'Can your drivers collect after 5 pm on weekdays? Our yard closes at 6.', 5 * D],
          ['them', 'Yes, we can schedule evening pickups for your yard from next week.', 5 * D - 3 * H]
        ] },
        { with: 'c4', ref: 'RR-1036 · Tractor with rotavator', unread: 0, thread: [
          ['them', 'Does the tractor come with a rotavator attachment?', 7 * D],
          ['me', 'Yes, the 1.5 m rotavator is included in the daily price.', 7 * D - H],
          ['them', 'Thank you, sending the request now.', 7 * D - 2 * H]
        ] },
        { with: 'a1', ref: 'Listing review · Tower crane', unread: 0, thread: [
          ['them', 'Hello, your tower crane listing needs a clearer photo of the load certificate before it can go live.', 11 * D],
          ['me', 'Uploaded a new photo now.', 11 * D - 4 * H],
          ['them', 'Thanks, the listing is approved.', 10 * D]
        ] }
      ],
      notifications: { unread: 5, items: [
        ['rental', 'New rental request', 'RR-1047 · Mobile crane 25T · Ruwan Jayasinghe · 6–9 Oct. Respond by 23:59 tomorrow.', 15, '../Rental Requests/index.html'],
        ['payment', 'Payment received', 'RR-1042 · CAT 320 Excavator · LKR 180,000 paid by Kasun Perera.', 2 * H, '../Rental Requests/index.html'],
        ['maintenance', 'Appointment confirmed', 'JCB 3CX · Nuwan Herath will visit on Thursday at 09:00.', 5 * H, null],
        ['rental', 'New rental request', 'RR-1045 · Scissor lift · Nimali Fernando · 4–5 Oct.', 8 * H, '../Rental Requests/index.html'],
        ['complaint', 'Complaint filed against you', 'CP-94 · Late handover reported on RR-1011. An admin will contact you.', 20 * H, null],
        ['rental', 'Request cancelled by customer', 'RR-1039 · Concrete mixer · Chamara Silva cancelled.', 2 * D, '../Rental Requests/index.html'],
        ['payment', 'Payout sent', 'LKR 342,500 for September rentals was sent to your bank.', 3 * D, null],
        ['rental', 'Equipment returned', 'RR-1027 · Vibratory roller · returned. Confirm condition.', 4 * D, '../Rental Requests/index.html'],
        ['maintenance', 'Appointment request declined', 'Generator service · Lahiru Madushanka is unavailable on 30 Sep.', 6 * D, null],
        ['rental', 'Request expired', 'RR-1020 · No response within 1 day, so the request was cancelled.', 8 * D, '../Rental Requests/index.html'],
        ['complaint', 'Complaint resolved', 'CP-71 · The damage claim on RR-0987 was upheld.', 13 * D, null]
      ] }
    },

    admin: {
      conversations: [
        { with: 'm2', ref: 'Driver shortage · Kandy', unread: 2, thread: [
          ['them', 'We are short of two drivers in the Kandy region this week. Can we pause new delivery bookings for Thursday?', 3 * H],
          ['them', 'Only Thursday, the rest of the week is fine.', 2 * H]
        ] },
        { with: 'c1', ref: 'CP-88 · Complaint review', unread: 0, thread: [
          ['me', 'Hello, I am reviewing your complaint CP-88 about the damaged tent. Could you send the photos you took at handover?', 12 * D],
          ['them', 'Yes, I have added them to the complaint.', 12 * D - H],
          ['me', 'Thank you. We will update you within two working days.', 12 * D - 2 * H]
        ] },
        { with: 'r1', ref: 'CP-94 · Late handover', unread: 1, thread: [
          ['me', 'A customer reported a late handover on RR-1011. Could you share what happened?', D],
          ['them', 'The machine was delayed by a breakdown on our side. We informed the customer by phone.', 4 * H]
        ] },
        { with: 'f2', ref: 'Credential check', unread: 0, thread: [
          ['me', 'Your crane operator licence scan is blurred. Please upload a clearer copy.', 4 * D],
          ['them', 'Uploaded again, please check.', 3 * D]
        ] },
        { with: 'm1', ref: 'Monthly report', unread: 0, thread: [
          ['them', 'The September delivery report for Colombo is ready on the dashboard.', 6 * D],
          ['me', 'Thanks Dinesh, I will review it this week.', 6 * D - H]
        ] }
      ],
      notifications: { unread: 4, items: [
        ['complaint', 'New complaint', 'CP-97 · Customer vs. delivery personnel · damaged goods on DL-320.', 40, '../Complaints & Users/index.html'],
        ['verification', 'Documents awaiting review', '3 new credential documents from freelance workers.', 3 * H, '../Document Verification/index.html'],
        ['complaint', 'Complaint escalated', 'CP-94 · Late handover · escalated by the customer.', 6 * H, '../Complaints & Users/index.html'],
        ['system', 'New equipment type requested', 'Kandy Plant & Machinery asked for "Pile driver".', 9 * H, '../Equipment Catalogue/index.html'],
        ['verification', 'Document re-uploaded', 'Pradeep Kumara uploaded a new crane operator licence.', D, '../Document Verification/index.html'],
        ['complaint', 'New complaint', 'CP-95 · Freelance worker vs. customer · unpaid overtime.', 2 * D, '../Complaints & Users/index.html'],
        ['system', 'Payment gateway delay', 'PayHere callbacks were delayed for 12 minutes. All payments reconciled.', 3 * D, null],
        ['verification', 'Documents awaiting review', '2 new business registrations from renting parties.', 5 * D, '../Document Verification/index.html'],
        ['complaint', 'Complaint resolved', 'CP-88 · Partial refund approved and sent.', 9 * D, '../Complaints & Users/index.html']
      ] }
    },

    maintenance_tech: {
      conversations: [
        { with: 'r1', ref: 'Hydraulic leak · JCB 3CX', unread: 1, thread: [
          ['them', 'Our JCB 3CX has a slow hydraulic leak on the boom cylinder. Are you free this week?', D],
          ['me', 'I can come on Thursday morning. Please keep the machine at your Peliyagoda yard.', 6 * H],
          ['them', 'Thursday works. Gate 2, ask for Mr. Nizam.', 40]
        ] },
        { with: 'r2', ref: 'Generator service', unread: 0, thread: [
          ['them', 'Can you service two 60 kVA generators next week?', 3 * D],
          ['me', 'Yes, Monday or Tuesday. It takes about half a day each.', 3 * D - H],
          ['them', 'Monday then. Thank you.', 3 * D - 2 * H]
        ] },
        { with: 'm1', ref: 'Maintenance assignment · MA-57', unread: 1, thread: [
          ['them', 'I have assigned you MA-57, a returned roller with a brake issue at Kelaniya.', 5 * H]
        ] },
        { with: 'a1', ref: 'Profile verification', unread: 0, thread: [
          ['them', 'Your NVQ certificate has been verified. Your profile is now visible to renting parties.', 8 * D],
          ['me', 'Thank you!', 8 * D - 30]
        ] }
      ],
      notifications: { unread: 3, items: [
        ['appointment', 'New appointment request', 'Lanka Heavy Hire (Pvt) Ltd · JCB 3CX hydraulic leak · Thu 09:00.', 30, '../Dashboard/index.html'],
        ['appointment', 'Appointment assigned', 'MA-57 · Vibratory roller brake check · Kelaniya.', 5 * H, '../Dashboard/index.html'],
        ['payment', 'Payment received', 'LKR 18,500 for the Colombo Equip Rentals generator service.', D, null],
        ['appointment', 'Appointment confirmed', 'Colombo Equip Rentals · 2 × generator service · Monday 08:30.', 3 * D, '../Dashboard/index.html'],
        ['appointment', 'Appointment cancelled', 'Negombo Tools Hub cancelled the compressor inspection.', 5 * D, '../Dashboard/index.html'],
        ['complaint', 'Complaint update', 'CP-83 · Your complaint about a late payment is under review.', 7 * D, null],
        ['payment', 'Payment received', 'LKR 12,000 for the Kandy Plant & Machinery excavator repair.', 10 * D, null]
      ] }
    },

    delivery_personnel: {
      conversations: [
        { with: 'm1', ref: 'DL-322 · Assignment', unread: 1, thread: [
          ['them', 'You have DL-322 tomorrow: scissor lift from Peliyagoda to Nugegoda. Vehicle WP LB-4521.', 3 * H],
          ['me', 'Received. What time is the pickup?', 2 * H],
          ['them', '9.00 at gate 2. The customer expects it before 11.', H]
        ] },
        { with: 'r2', ref: 'DL-322 · Pickup', unread: 0, thread: [
          ['me', 'I will collect the scissor lift at 9.00 tomorrow for delivery DL-322.', 2 * D],
          ['them', 'OK, the yard supervisor will have it ready at gate 2.', 2 * D - 30]
        ] },
        { with: 'c1', ref: 'DL-311 · Delivery to Kaduwela', unread: 0, thread: [
          ['me', 'I am on the way with the generator. ETA 40 minutes.', 4 * D],
          ['them', 'Thanks. Ask for Mr. Silva at the gate.', 4 * D - 10],
          ['me', 'Delivered and signed off. Have a good day.', 4 * D - 2 * H]
        ] },
        { with: 'c2', ref: 'DL-324 · Tent delivery', unread: 1, thread: [
          ['them', 'Hi, can the tent delivery on Saturday come before 8 am? The event setup starts early.', 50]
        ] }
      ],
      notifications: { unread: 3, items: [
        ['assignment', 'New delivery assigned', 'DL-322 · Scissor lift · Peliyagoda → Nugegoda · tomorrow 09:00 · WP LB-4521.', H, '../Dashboard/index.html'],
        ['assignment', 'New delivery assigned', 'DL-324 · Event tent 20×40 · Colombo 7 → Negombo · Saturday.', 4 * H, '../Dashboard/index.html'],
        ['payment', 'Payment received', 'LKR 9,500 for 4 deliveries completed last week.', D, null],
        ['assignment', 'Delivery reassigned', 'DL-317 was moved to Roshan Abeysekara.', 2 * D, '../Dashboard/index.html'],
        ['assignment', 'Delivery completed', 'DL-311 · Diesel generator 60 kVA · signed off by the customer.', 4 * D, '../Dashboard/index.html'],
        ['complaint', 'Complaint update', 'CP-90 · Your complaint about an unsafe loading bay was resolved.', 6 * D, null],
        ['payment', 'Payment received', 'LKR 11,200 for 5 deliveries.', 8 * D, null]
      ] }
    },

    area_manager: {
      conversations: [
        { with: 'd1', ref: 'DL-320 · Damaged goods', unread: 2, thread: [
          ['me', 'The customer on DL-320 says the tent poles were bent. What happened?', 5 * H],
          ['them', 'They were loaded by the renting party staff. I noted it on the handover sheet.', 3 * H],
          ['them', 'I have photos of the load before I left the yard.', 3 * H - 5]
        ] },
        { with: 'r1', ref: 'Delivery pickups · Colombo', unread: 0, thread: [
          ['them', 'Can your drivers collect after 5 pm on weekdays? Our yard closes at 6.', 5 * D],
          ['me', 'Yes, we can schedule evening pickups for your yard from next week.', 5 * D - 3 * H]
        ] },
        { with: 't1', ref: 'Maintenance assignment · MA-57', unread: 0, thread: [
          ['me', 'I have assigned you MA-57, a returned roller with a brake issue at Kelaniya.', 5 * H]
        ] },
        { with: 'c1', ref: 'DL-305 · Delivery delay', unread: 0, thread: [
          ['me', 'Your delivery DL-305 is delayed by about two hours due to a road closure in Kelaniya. Sorry for the trouble.', 9 * D],
          ['them', 'Understood, thanks for letting me know.', 9 * D - 20]
        ] },
        { with: 'a1', ref: 'Monthly report', unread: 0, thread: [
          ['me', 'The September delivery report for Colombo is ready on the dashboard.', 6 * D],
          ['them', 'Thanks, I will review it this week.', 6 * D - H]
        ] },
        { with: 'd3', ref: 'Vehicle WP LB-4521', unread: 0, thread: [
          ['them', 'The lorry WP LB-4521 is due for service on Monday.', 3 * D],
          ['me', 'Noted. I will not assign it on Monday.', 3 * D - H]
        ] }
      ],
      notifications: { unread: 4, items: [
        ['delivery', 'New delivery request', 'DL-326 · Mobile crane 25T · Kandy Plant & Machinery → Kadawatha · 6 Oct.', 25, '../Delivery Assignments/index.html'],
        ['alert', 'Delivery running late', 'DL-321 · Saman Priyantha is 45 minutes behind schedule.', 2 * H, '../Delivery Assignments/index.html'],
        ['delivery', 'New delivery request', 'DL-325 · Event tent 20×40 · Colombo 7 → Negombo · Saturday.', 4 * H, '../Delivery Assignments/index.html'],
        ['complaint', 'Complaint about a delivery', 'CP-97 · Damaged goods on DL-320. The admin may contact you.', 6 * H, null],
        ['alert', 'Driver unavailable', 'Iresha Samarasinghe is unavailable tomorrow.', D, '../Delivery Personnel/index.html'],
        ['delivery', 'Delivery completed', 'DL-311 · Diesel generator 60 kVA · Kaduwela.', 4 * D, '../Delivery Assignments/index.html'],
        ['alert', 'Vehicle service due', 'WP LB-4521 is due for service on Monday.', 3 * D, '../Vehicles/index.html'],
        ['delivery', 'New delivery request', 'DL-318 · Diesel generator 60 kVA · Colombo → Kaduwela · 2 Oct.', 5 * D, '../Delivery Assignments/index.html']
      ] }
    }
  };

  // ---------- Helpers ----------
  function role() {
    var body = document.body;
    if (!body) return '';
    return body.getAttribute('data-inbox-role') || body.getAttribute('data-require-auth') || '';
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /** Local "YYYY-MM-DD HH:MM:SS", the format the API returns timestamps in. */
  function stamp(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
      pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function minutesAgo(minutes) {
    return stamp(new Date(Date.now() - minutes * 60000));
  }

  function ok(data, status) {
    return Promise.resolve({ ok: true, status: status || 200, data: data, error: '', fields: {} });
  }

  function fail(message, status, fields) {
    return Promise.resolve({ ok: false, status: status || 422, data: null, error: message, fields: fields || {} });
  }

  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) || n < 1 ? fallback : n;
  }

  /** Slices a full array into the {items, page, per_page, total, total_pages} envelope. */
  function envelope(rows, params, defaultPerPage) {
    var perPage = Math.min(toInt(params.per_page, defaultPerPage), 50);
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var page = Math.min(toInt(params.page, 1), totalPages);
    return {
      items: rows.slice((page - 1) * perPage, page * perPage),
      page: page,
      per_page: perPage,
      total: total,
      total_pages: totalPages
    };
  }

  function contains(haystack, needle) {
    return String(haystack || '').toLowerCase().indexOf(needle) !== -1;
  }

  // ---------- Store ----------
  var cache = null;

  function storageKey() {
    return STORAGE_PREFIX + role();
  }

  function buildSeed() {
    var seed = SEED[role()] || { conversations: [], notifications: { unread: 0, items: [] } };
    var state = { next_id: 1, conversations: [], messages: [], notifications: [], extra_people: [] };

    seed.conversations.forEach(function (conv) {
      var conversationId = String(state.next_id++);
      var ids = [];
      conv.thread.forEach(function (line) {
        var id = state.next_id++;
        ids.push({ id: id, sender: line[0] });
        state.messages.push({
          message_id: String(id),
          conversation_id: conversationId,
          sender: line[0],
          body: line[1],
          sent_at: minutesAgo(line[2])
        });
      });

      // Everything is read up to just before the newest `unread` messages from them.
      var lastRead = ids.length ? ids[ids.length - 1].id : 0;
      var remaining = conv.unread || 0;
      for (var i = ids.length - 1; i >= 0 && remaining > 0; i--) {
        if (ids[i].sender === 'them') remaining--;
        lastRead = i > 0 ? ids[i - 1].id : 0;
      }

      state.conversations.push({
        conversation_id: conversationId,
        person_id: conv.with,
        context_ref: conv.ref,
        created_at: conv.thread.length ? minutesAgo(conv.thread[0][2]) : minutesAgo(0),
        last_read_message_id: lastRead
      });
    });

    seed.notifications.items.forEach(function (row, index) {
      state.notifications.push({
        notification_id: String(state.next_id++),
        type: row[0],
        title: row[1],
        body: row[2],
        created_at: minutesAgo(row[3]),
        is_read: index >= seed.notifications.unread,
        link: row[4]
      });
    });

    return state;
  }

  function load() {
    if (cache) return cache;
    try {
      var raw = window.localStorage.getItem(storageKey());
      if (raw) cache = JSON.parse(raw);
    } catch (e) {
      cache = null;
    }
    if (!cache || !cache.conversations || !cache.notifications) {
      cache = buildSeed();
      save();
    }
    return cache;
  }

  function save() {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(cache));
    } catch (e) {
      // Private window or storage blocked: changes last until the page is left.
    }
  }

  function person(state, personId) {
    for (var i = 0; i < PEOPLE.length; i++) {
      if (PEOPLE[i].person_id === personId) return PEOPLE[i];
    }
    for (var j = 0; j < state.extra_people.length; j++) {
      if (state.extra_people[j].person_id === personId) return state.extra_people[j];
    }
    return { person_id: personId, name: 'Unknown user', role: '', detail: '' };
  }

  function canStart(targetRole) {
    return (RULES[role()] || []).indexOf(targetRole) !== -1;
  }

  function findConversation(state, conversationId) {
    for (var i = 0; i < state.conversations.length; i++) {
      if (state.conversations[i].conversation_id === String(conversationId)) return state.conversations[i];
    }
    return null;
  }

  function conversationWith(state, personId) {
    for (var i = 0; i < state.conversations.length; i++) {
      if (state.conversations[i].person_id === personId) return state.conversations[i];
    }
    return null;
  }

  function threadOf(state, conversationId) {
    return state.messages.filter(function (m) { return m.conversation_id === conversationId; });
  }

  /** A conversation row as the list shows it. */
  function presentConversation(state, conv) {
    var party = person(state, conv.person_id);
    var thread = threadOf(state, conv.conversation_id);
    var last = thread[thread.length - 1];
    var unread = thread.filter(function (m) {
      return m.sender === 'them' && Number(m.message_id) > conv.last_read_message_id;
    }).length;
    return {
      conversation_id: conv.conversation_id,
      party_id: party.person_id,
      party_name: party.name,
      party_role: ROLE_LABELS[party.role] || '',
      party_role_key: party.role,
      party_detail: party.detail,
      context_ref: conv.context_ref || '',
      last_message: last ? last.body : '',
      last_message_at: last ? last.sent_at : conv.created_at,
      unread_count: unread,
      can_start: canStart(party.role)
    };
  }

  function presentPerson(state, p) {
    var existing = conversationWith(state, p.person_id);
    return {
      person_id: p.person_id,
      name: p.name,
      role: p.role,
      role_label: ROLE_LABELS[p.role] || '',
      detail: p.detail,
      conversation_id: existing ? existing.conversation_id : null
    };
  }

  // ---------- Messages ----------
  /** GET conversations ?q=&page=&per_page=, most recent activity first. */
  function conversations(params) {
    params = params || {};
    var state = load();
    var q = String(params.q || '').trim().toLowerCase();
    var rows = state.conversations.map(function (conv) { return presentConversation(state, conv); });
    if (q) {
      rows = rows.filter(function (row) {
        return contains(row.party_name, q) || contains(row.party_role, q) ||
          contains(row.context_ref, q) || contains(row.last_message, q);
      });
    }
    rows.sort(function (a, b) {
      return a.last_message_at < b.last_message_at ? 1 : (a.last_message_at > b.last_message_at ? -1 : 0);
    });
    return ok(envelope(rows, params, 8));
  }

  /** One conversation row, for opening a thread by id. */
  function conversation(conversationId) {
    var state = load();
    var conv = findConversation(state, conversationId);
    if (!conv) return fail('Conversation not found.', 404);
    return ok(presentConversation(state, conv));
  }

  /** GET a thread, newest first, paged. Reading it marks it read. */
  function messages(conversationId, params) {
    params = params || {};
    var state = load();
    var conv = findConversation(state, conversationId);
    if (!conv) return fail('Conversation not found.', 404);

    var thread = threadOf(state, conv.conversation_id).slice().reverse();
    if (thread.length) {
      conv.last_read_message_id = Math.max(conv.last_read_message_id, Number(thread[0].message_id));
      save();
    }
    return ok(envelope(thread, params, 12));
  }

  /** POST a message into a conversation you are part of. */
  function send(conversationId, body) {
    var state = load();
    var conv = findConversation(state, conversationId);
    if (!conv) return fail('Conversation not found.', 404);

    var text = String(body || '').trim();
    if (text === '') return fail('Write a message first.', 422, { body: 'Write a message first.' });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return fail('Messages can be at most ' + MAX_MESSAGE_LENGTH + ' characters.', 422);
    }

    var message = {
      message_id: String(state.next_id++),
      conversation_id: conv.conversation_id,
      sender: 'me',
      body: text,
      sent_at: stamp(new Date())
    };
    state.messages.push(message);
    conv.last_read_message_id = Number(message.message_id);
    save();
    return ok(message, 201);
  }

  /** GET people you may start a conversation with ?q=&role=&page=&per_page=. */
  function people(params) {
    params = params || {};
    var state = load();
    var allowed = RULES[role()] || [];
    var q = String(params.q || '').trim().toLowerCase();
    var roleFilter = params.role || '';

    var rows = PEOPLE.concat(state.extra_people).filter(function (p) {
      if (allowed.indexOf(p.role) === -1) return false;
      if (roleFilter && p.role !== roleFilter) return false;
      return !q || contains(p.name, q) || contains(p.detail, q);
    }).map(function (p) { return presentPerson(state, p); });

    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return ok(envelope(rows, params, 8));
  }

  /**
   * POST start a conversation with a person, or reuse the one you already have.
   * Refused when your role may not start one with theirs.
   */
  function start(personId, contextRef) {
    var state = load();
    var target = person(state, personId);
    if (!target.role) return fail('That person could not be found.', 404);
    if (!canStart(target.role)) {
      var label = (ROLE_LABELS[target.role] || 'user').toLowerCase();
      return fail('You can\'t start a conversation with ' + (/^[aeiou]/.test(label) ? 'an ' : 'a ') + label + '.', 403);
    }

    var existing = conversationWith(state, personId);
    if (existing) {
      if (contextRef) {
        existing.context_ref = contextRef;
        save();
      }
      return ok(presentConversation(state, existing));
    }

    var conv = {
      conversation_id: String(state.next_id++),
      person_id: personId,
      context_ref: contextRef || '',
      created_at: stamp(new Date()),
      last_read_message_id: 0
    };
    state.conversations.push(conv);
    save();
    return ok(presentConversation(state, conv), 201);
  }

  /**
   * Finds a person by exact name and role, for links from other pages such as
   * a listing's "Message" button. A real renting party that is not in the mock
   * directory is added to it, so the link still opens a conversation.
   */
  function findPerson(name, personRole) {
    var state = load();
    var wanted = String(name || '').trim();
    if (!wanted || !ROLE_LABELS[personRole]) return fail('That person could not be found.', 404);

    var all = PEOPLE.concat(state.extra_people);
    for (var i = 0; i < all.length; i++) {
      if (all[i].role === personRole && all[i].name.toLowerCase() === wanted.toLowerCase()) {
        return ok(presentPerson(state, all[i]));
      }
    }

    var added = { person_id: 'x' + state.next_id++, name: wanted, role: personRole, detail: '' };
    state.extra_people.push(added);
    save();
    return ok(presentPerson(state, added));
  }

  // ---------- Notifications ----------
  /** GET notifications ?type=&unread=1&page=&per_page=, newest first. */
  function notifications(params) {
    params = params || {};
    var state = load();
    var rows = state.notifications.filter(function (n) {
      if (params.type && n.type !== params.type) return false;
      if (params.unread === '1' && n.is_read) return false;
      return true;
    }).slice().sort(function (a, b) {
      return a.created_at < b.created_at ? 1 : (a.created_at > b.created_at ? -1 : 0);
    });
    return ok(envelope(rows, params, 10));
  }

  /** POST mark read: {notification_id} for one, {all: true} for every one. */
  function markRead(body) {
    body = body || {};
    var state = load();
    var marked = 0;
    state.notifications.forEach(function (n) {
      if (n.is_read) return;
      if (body.all || n.notification_id === String(body.notification_id)) {
        n.is_read = true;
        marked++;
      }
    });
    if (!body.all && !marked) {
      var found = state.notifications.some(function (n) { return n.notification_id === String(body.notification_id); });
      if (!found) return fail('Notification not found.', 404);
    }
    save();
    return ok({ marked: marked });
  }

  // ---------- Badges ----------
  /** Unread messages (across all conversations) and unread notifications. */
  function counts() {
    var state = load();
    var messagesUnread = 0;
    state.conversations.forEach(function (conv) {
      messagesUnread += presentConversation(state, conv).unread_count;
    });
    var notificationsUnread = state.notifications.filter(function (n) { return !n.is_read; }).length;
    return ok({ messages: messagesUnread, notifications: notificationsUnread });
  }

  window.EquipifyInbox = {
    ROLE_LABELS: ROLE_LABELS,
    RULES: RULES,
    MAX_MESSAGE_LENGTH: MAX_MESSAGE_LENGTH,
    role: role,
    canStart: canStart,
    allowedRoles: function () { return (RULES[role()] || []).slice(); },
    notificationTypes: function () { return (NOTIFICATION_TYPES[role()] || []).slice(); },
    conversations: conversations,
    conversation: conversation,
    messages: messages,
    send: send,
    people: people,
    start: start,
    findPerson: findPerson,
    notifications: notifications,
    markRead: markRead,
    counts: counts
  };
})();
