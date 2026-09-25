<?php
/**
 * One line per endpoint: method, path, handler, allowed roles (omit = public).
 * Loaded by api/index.php with $router in scope.
 */

declare(strict_types=1);

// Auth
$router->add('POST', '/auth/register', [AuthController::class, 'register']);
$router->add('POST', '/auth/register/renting-party', [AuthController::class, 'registerRentingParty']);
$router->add('POST', '/auth/register/freelance-worker', [AuthController::class, 'registerFreelanceWorker']);
$router->add('POST', '/auth/login',   [AuthController::class, 'login']);
$router->add('POST', '/auth/logout',   [AuthController::class, 'logout']);
$router->add('GET',  '/auth/me',       [AuthController::class, 'me']);

// Admin: area manager registration (no public sign-up for this role)
$router->add('GET',  '/admin/area-managers', [AreaManagerController::class, 'index'], ['admin']);
$router->add('POST', '/admin/area-managers', [AreaManagerController::class, 'store'], ['admin']);

// Public: the equipment catalogue (categories -> types -> spec fields). Read
// only and needs no login, so logged-out visitors can browse and filter.
$router->add('GET', '/catalogue',                  [CatalogueController::class, 'index']);
$router->add('GET', '/catalogue/types/{id}/fields', [CatalogueController::class, 'fields']);

// Admin: manage the catalogue. Nothing is deleted, only deactivated, because
// listings point at their type and types at their category.
$router->add('GET',  '/admin/catalogue',                           [AdminCatalogueController::class, 'index'],              ['admin']);
$router->add('POST', '/admin/catalogue/categories',                [AdminCatalogueController::class, 'storeCategory'],      ['admin']);
$router->add('PUT',  '/admin/catalogue/categories/{id}',           [AdminCatalogueController::class, 'updateCategory'],     ['admin']);
$router->add('POST', '/admin/catalogue/categories/{id}/deactivate', [AdminCatalogueController::class, 'deactivateCategory'], ['admin']);
$router->add('POST', '/admin/catalogue/categories/{id}/activate',  [AdminCatalogueController::class, 'activateCategory'],   ['admin']);
$router->add('POST', '/admin/catalogue/types',                     [AdminCatalogueController::class, 'storeType'],          ['admin']);
$router->add('GET',  '/admin/catalogue/types/{id}',                [AdminCatalogueController::class, 'showType'],           ['admin']);
$router->add('PUT',  '/admin/catalogue/types/{id}',                [AdminCatalogueController::class, 'updateType'],         ['admin']);
$router->add('POST', '/admin/catalogue/types/{id}/deactivate',     [AdminCatalogueController::class, 'deactivateType'],     ['admin']);
$router->add('POST', '/admin/catalogue/types/{id}/activate',       [AdminCatalogueController::class, 'activateType'],       ['admin']);

// Public: browse listings (search + step-by-step filters), one listing, and
// listing photos (a hidden listing's photos are served to its owner only).
$router->add('GET', '/equipment',                          [EquipmentBrowseController::class, 'index']);
$router->add('GET', '/equipment/{id}',                     [EquipmentBrowseController::class, 'show']);
$router->add('GET', '/equipment/{id}/photos/{photoId}',    [EquipmentBrowseController::class, 'photo']);

// Renting party: own equipment listings. Removing a listing with rental
// history retires it instead of deleting it. Photos are uploaded one per
// request once the listing exists.
$router->add('GET',    '/renting-party/equipment',                               [RentingPartyEquipmentController::class, 'index'],        ['renting_party']);
$router->add('POST',   '/renting-party/equipment',                               [RentingPartyEquipmentController::class, 'store'],        ['renting_party']);
$router->add('GET',    '/renting-party/equipment/{id}',                          [RentingPartyEquipmentController::class, 'show'],         ['renting_party']);
$router->add('PUT',    '/renting-party/equipment/{id}',                          [RentingPartyEquipmentController::class, 'update'],       ['renting_party']);
$router->add('DELETE', '/renting-party/equipment/{id}',                          [RentingPartyEquipmentController::class, 'destroy'],      ['renting_party']);
$router->add('POST',   '/renting-party/equipment/{id}/status',                   [RentingPartyEquipmentController::class, 'updateStatus'], ['renting_party']);
$router->add('POST',   '/renting-party/equipment/{id}/photos',                   [RentingPartyEquipmentController::class, 'storePhoto'],   ['renting_party']);
$router->add('POST',   '/renting-party/equipment/{id}/photos/{photoId}/cover',   [RentingPartyEquipmentController::class, 'coverPhoto'],   ['renting_party']);
$router->add('DELETE', '/renting-party/equipment/{id}/photos/{photoId}',         [RentingPartyEquipmentController::class, 'destroyPhoto'], ['renting_party']);

// New equipment-type requests: a renting party asks, an admin approves (which
// creates the type) or rejects with a note.
$router->add('GET',  '/renting-party/type-requests',       [EquipmentTypeRequestController::class, 'mine'],    ['renting_party']);
$router->add('POST', '/renting-party/type-requests',       [EquipmentTypeRequestController::class, 'store'],   ['renting_party']);
$router->add('GET',  '/admin/type-requests',               [EquipmentTypeRequestController::class, 'index'],   ['admin']);
$router->add('POST', '/admin/type-requests/{id}/approve',  [EquipmentTypeRequestController::class, 'approve'], ['admin']);
$router->add('POST', '/admin/type-requests/{id}/reject',   [EquipmentTypeRequestController::class, 'reject'],  ['admin']);

// Area manager: staff registration (no public sign-up for either role)
$router->add('GET',  '/area-manager/delivery-personnel', [DeliveryPersonnelController::class, 'index'], ['area_manager']);
$router->add('POST', '/area-manager/delivery-personnel', [DeliveryPersonnelController::class, 'store'], ['area_manager']);
$router->add('GET',  '/area-manager/technicians',        [MaintenanceTechController::class, 'index'],   ['area_manager']);
$router->add('POST', '/area-manager/technicians',        [MaintenanceTechController::class, 'store'],   ['area_manager']);

// Area manager: delivery fleet. Removing a vehicle with delivery history
// retires it instead of deleting it; restore brings it back.
$router->add('GET',    '/area-manager/vehicles',              [VehicleController::class, 'index'],   ['area_manager']);
$router->add('POST',   '/area-manager/vehicles',              [VehicleController::class, 'store'],   ['area_manager']);
$router->add('GET',    '/area-manager/vehicles/{id}',         [VehicleController::class, 'show'],    ['area_manager']);
$router->add('PUT',    '/area-manager/vehicles/{id}',         [VehicleController::class, 'update'],  ['area_manager']);
$router->add('DELETE', '/area-manager/vehicles/{id}',         [VehicleController::class, 'destroy'], ['area_manager']);
$router->add('POST',   '/area-manager/vehicles/{id}/restore', [VehicleController::class, 'restore'], ['area_manager']);

// Freelance worker (equipment operator): own profile, credential documents and
// portfolio.
$router->add('GET',  '/freelancer/profile',      [FreelanceWorkerController::class, 'showProfile'],        ['freelance_worker']);
$router->add('PUT',  '/freelancer/profile',      [FreelanceWorkerController::class, 'updateProfile'],      ['freelance_worker']);
$router->add('PUT',  '/freelancer/availability', [FreelanceWorkerController::class, 'updateAvailability'], ['freelance_worker']);
$router->add('GET',  '/freelancer/documents',    [FreelanceWorkerController::class, 'indexDocuments'],     ['freelance_worker']);
$router->add('POST', '/freelancer/documents',    [FreelanceWorkerController::class, 'storeDocument'],      ['freelance_worker']);
$router->add('GET',  '/freelancer/portfolio',    [FreelanceWorkerController::class, 'indexPortfolio'],     ['freelance_worker']);
$router->add('POST', '/freelancer/portfolio',    [FreelanceWorkerController::class, 'storePortfolio'],     ['freelance_worker']);
$router->add('GET',  '/freelancer/portfolio/{id}/image', [FreelanceWorkerController::class, 'showPortfolioImage'], ['freelance_worker']);

// Freelance worker: payout destinations for PayHere. Account details are stored
// encrypted and are never read back, so there is no endpoint that returns one.
// The table is keyed on user_id, so delivery personnel can be added to these
// role lists when their payments page is built, with no other change.
$router->add('GET',    '/freelancer/payout-providers',        [PayoutMethodController::class, 'indexProviders'], ['freelance_worker']);
$router->add('GET',    '/freelancer/payout-methods',          [PayoutMethodController::class, 'index'],          ['freelance_worker']);
$router->add('POST',   '/freelancer/payout-methods',          [PayoutMethodController::class, 'store'],          ['freelance_worker']);
$router->add('POST',   '/freelancer/payout-methods/{id}/default', [PayoutMethodController::class, 'makeDefault'], ['freelance_worker']);
$router->add('DELETE', '/freelancer/payout-methods/{id}',     [PayoutMethodController::class, 'destroy'],        ['freelance_worker']);

// Customer: fixed-price job offers for freelance workers. Deleting an open job
// cancels it instead (see JobController::destroy); hiring picks one bid.
$router->add('GET',    '/customer/jobs',               [JobController::class, 'index'],    ['customer']);
$router->add('POST',   '/customer/jobs',               [JobController::class, 'store'],    ['customer']);
$router->add('GET',    '/customer/jobs/{id}',          [JobController::class, 'show'],     ['customer']);
$router->add('PUT',    '/customer/jobs/{id}',          [JobController::class, 'update'],   ['customer']);
$router->add('DELETE', '/customer/jobs/{id}',          [JobController::class, 'destroy'],  ['customer']);
$router->add('POST',   '/customer/jobs/{id}/publish',  [JobController::class, 'publish'],  ['customer']);
$router->add('GET',    '/customer/jobs/{id}/bids',     [JobController::class, 'bids'],     ['customer']);
$router->add('POST',   '/customer/jobs/{id}/hire',     [JobController::class, 'hire'],     ['customer']);
$router->add('POST',   '/customer/jobs/{id}/complete', [JobController::class, 'complete'], ['customer']);

// Freelance worker: the published jobs, their own bids, and declines.
// No "accept" route: an operator competes for a job by bidding, and it is the
// customer who awards it. Declining only marks the offer Declined for them.
$router->add('GET',  '/freelancer/job-offers',              [JobOfferController::class, 'jobOffers'],    ['freelance_worker']);
$router->add('POST', '/freelancer/job-offers/{id}/decline', [JobOfferController::class, 'declineOffer'], ['freelance_worker']);
$router->add('POST', '/freelancer/bids',                    [JobOfferController::class, 'placeBid'],     ['freelance_worker']);

// Freelance worker: placeholder data until the job history/payments
// tables exist. Same response shapes as the real endpoints — see the controller.
$router->add('GET',  '/freelancer/dashboard',                [FreelanceWorkerMockController::class, 'dashboard'],             ['freelance_worker']);
$router->add('GET',  '/freelancer/jobs',                     [FreelanceWorkerMockController::class, 'jobs'],                  ['freelance_worker']);
$router->add('POST', '/freelancer/jobs/{id}/rating',         [FreelanceWorkerMockController::class, 'rateCustomer'],          ['freelance_worker']);
$router->add('GET',  '/freelancer/payments',                 [FreelanceWorkerMockController::class, 'payments'],              ['freelance_worker']);
$router->add('GET',  '/freelancer/invoices/{id}',            [FreelanceWorkerMockController::class, 'invoice'],               ['freelance_worker']);
$router->add('GET',  '/freelancer/conversations',            [MessageController::class, 'conversations'],         ['freelance_worker']);
$router->add('GET',  '/freelancer/messages',                 [MessageController::class, 'messages'],              ['freelance_worker']);
$router->add('POST', '/freelancer/messages',                 [MessageController::class, 'sendMessage'],           ['freelance_worker']);
$router->add('GET',  '/freelancer/notifications',            [FreelanceWorkerMockController::class, 'notifications'],         ['freelance_worker']);
$router->add('POST', '/freelancer/notifications/read',       [FreelanceWorkerMockController::class, 'markNotificationsRead'], ['freelance_worker']);
$router->add('GET',  '/freelancer/complaints',               [ComplaintController::class, 'index'],            ['freelance_worker']);
$router->add('POST', '/freelancer/complaints',               [ComplaintController::class, 'store'],       ['freelance_worker']);

// Complaint management: shared session-scoped APIs; reviewers only read, admin alone updates status.
$complaintUsers = array_keys(ComplaintModel::TARGET_ROLES);
$complaintReaders = array_merge($complaintUsers, ComplaintModel::REVIEWERS);
$router->add('GET', '/complaints/metadata', [ComplaintController::class, 'metadata'], $complaintReaders);
$router->add('GET', '/complaints/targets', [ComplaintController::class, 'targets'], $complaintUsers);
$router->add('GET', '/complaints', [ComplaintController::class, 'index'], $complaintReaders);
$router->add('POST', '/complaints', [ComplaintController::class, 'store'], $complaintUsers);
$router->add('GET', '/complaints/{id}', [ComplaintController::class, 'show'], $complaintReaders);
$router->add('GET', '/complaints/{id}/attachment', [ComplaintController::class, 'attachment'], $complaintReaders);
$router->add('POST', '/complaints/{id}/status', [ComplaintController::class, 'updateStatus'], ['admin']);

// Operational messaging: role gates select the portal; membership controls conversation access.
$router->add('GET', '/customer/conversations', [MessageController::class, 'conversations'], ['customer']);
$router->add('GET', '/customer/messages', [MessageController::class, 'messages'], ['customer']);
$router->add('POST', '/customer/messages', [MessageController::class, 'sendMessage'], ['customer']);
$router->add('GET', '/renting-party/conversations', [MessageController::class, 'conversations'], ['renting_party']);
$router->add('GET', '/renting-party/messages', [MessageController::class, 'messages'], ['renting_party']);
$router->add('POST', '/renting-party/messages', [MessageController::class, 'sendMessage'], ['renting_party']);
$router->add('GET', '/delivery-personnel/conversations', [MessageController::class, 'conversations'], ['delivery_personnel']);
$router->add('GET', '/delivery-personnel/messages', [MessageController::class, 'messages'], ['delivery_personnel']);
$router->add('POST', '/delivery-personnel/messages', [MessageController::class, 'sendMessage'], ['delivery_personnel']);
$router->add('GET', '/technician/conversations', [MessageController::class, 'conversations'], ['maintenance_tech']);
$router->add('GET', '/technician/messages', [MessageController::class, 'messages'], ['maintenance_tech']);
$router->add('POST', '/technician/messages', [MessageController::class, 'sendMessage'], ['maintenance_tech']);

// Discover operational counterparts and open a direct conversation.
$router->add('GET', '/customer/message-users', [MessageController::class, 'users'], ['customer']);
$router->add('POST', '/customer/conversations', [MessageController::class, 'startConversation'], ['customer']);
$router->add('GET', '/renting-party/message-users', [MessageController::class, 'users'], ['renting_party']);
$router->add('POST', '/renting-party/conversations', [MessageController::class, 'startConversation'], ['renting_party']);
$router->add('GET', '/freelancer/message-users', [MessageController::class, 'users'], ['freelance_worker']);
$router->add('POST', '/freelancer/conversations', [MessageController::class, 'startConversation'], ['freelance_worker']);
$router->add('GET', '/delivery-personnel/message-users', [MessageController::class, 'users'], ['delivery_personnel']);
$router->add('POST', '/delivery-personnel/conversations', [MessageController::class, 'startConversation'], ['delivery_personnel']);
$router->add('GET', '/technician/message-users', [MessageController::class, 'users'], ['maintenance_tech']);
$router->add('POST', '/technician/conversations', [MessageController::class, 'startConversation'], ['maintenance_tech']);
