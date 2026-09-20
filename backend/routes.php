<?php
/**
 * One line per endpoint: method, path, handler, allowed roles (omit = public).
 * Loaded by api/index.php with $router in scope.
 */

declare(strict_types=1);

// Auth
$router->add('POST', '/auth/register', [AuthController::class, 'register']);
$router->add('POST', '/auth/register/renting-party', [AuthController::class, 'registerRentingParty']);
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
