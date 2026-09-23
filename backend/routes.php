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

// Area manager: staff registration (no public sign-up for either role)
$router->add('GET',  '/area-manager/delivery-personnel', [DeliveryPersonnelController::class, 'index'], ['area_manager']);
$router->add('POST', '/area-manager/delivery-personnel', [DeliveryPersonnelController::class, 'store'], ['area_manager']);
$router->add('GET',  '/area-manager/technicians',        [MaintenanceTechController::class, 'index'],   ['area_manager']);
$router->add('POST', '/area-manager/technicians',        [MaintenanceTechController::class, 'store'],   ['area_manager']);

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

// Freelance worker: placeholder data until the jobs/bids/payments/messaging
// tables exist. Same response shapes as the real endpoints — see the controller.
$router->add('GET',  '/freelancer/dashboard',                [FreelanceWorkerMockController::class, 'dashboard'],             ['freelance_worker']);
$router->add('GET',  '/freelancer/job-offers',               [FreelanceWorkerMockController::class, 'jobOffers'],             ['freelance_worker']);
// No "accept" route: an operator competes for a job by bidding, and it is the
// customer who awards it. Declining only removes the offer from their own list.
$router->add('POST', '/freelancer/job-offers/{id}/decline',  [FreelanceWorkerMockController::class, 'declineOffer'],          ['freelance_worker']);
$router->add('POST', '/freelancer/bids',                     [FreelanceWorkerMockController::class, 'placeBid'],              ['freelance_worker']);
$router->add('GET',  '/freelancer/jobs',                     [FreelanceWorkerMockController::class, 'jobs'],                  ['freelance_worker']);
$router->add('POST', '/freelancer/jobs/{id}/rating',         [FreelanceWorkerMockController::class, 'rateCustomer'],          ['freelance_worker']);
$router->add('GET',  '/freelancer/payments',                 [FreelanceWorkerMockController::class, 'payments'],              ['freelance_worker']);
$router->add('GET',  '/freelancer/invoices/{id}',            [FreelanceWorkerMockController::class, 'invoice'],               ['freelance_worker']);
$router->add('GET',  '/freelancer/conversations',            [FreelanceWorkerMockController::class, 'conversations'],         ['freelance_worker']);
$router->add('GET',  '/freelancer/messages',                 [FreelanceWorkerMockController::class, 'messages'],              ['freelance_worker']);
$router->add('POST', '/freelancer/messages',                 [FreelanceWorkerMockController::class, 'sendMessage'],           ['freelance_worker']);
$router->add('GET',  '/freelancer/notifications',            [FreelanceWorkerMockController::class, 'notifications'],         ['freelance_worker']);
$router->add('POST', '/freelancer/notifications/read',       [FreelanceWorkerMockController::class, 'markNotificationsRead'], ['freelance_worker']);
$router->add('GET',  '/freelancer/complaints',               [FreelanceWorkerMockController::class, 'complaints'],            ['freelance_worker']);
$router->add('POST', '/freelancer/complaints',               [FreelanceWorkerMockController::class, 'submitComplaint'],       ['freelance_worker']);
