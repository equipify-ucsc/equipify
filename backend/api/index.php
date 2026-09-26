<?php
/**
 * Front controller: the only PHP file the browser reaches (api/.htaccess rewrites
 * every /api/... URL here). Starts the session, loads the app, dispatches the
 * request, and turns any uncaught Throwable into a logged, generic 500.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Validator.php';
require_once __DIR__ . '/../core/Router.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../controllers/AreaManagerController.php';
require_once __DIR__ . '/../controllers/DeliveryPersonnelController.php';
require_once __DIR__ . '/../controllers/MaintenanceTechController.php';
require_once __DIR__ . '/../controllers/VehicleController.php';
require_once __DIR__ . '/../controllers/FreelanceWorkerController.php';
require_once __DIR__ . '/../controllers/FreelanceWorkerMockController.php';
require_once __DIR__ . '/../controllers/PayoutMethodController.php';
require_once __DIR__ . '/../controllers/ProfileController.php';
require_once __DIR__ . '/../controllers/JobController.php';
require_once __DIR__ . '/../controllers/JobOfferController.php';
require_once __DIR__ . '/../controllers/CatalogueController.php';
require_once __DIR__ . '/../controllers/AdminCatalogueController.php';
require_once __DIR__ . '/../controllers/RentingPartyEquipmentController.php';
require_once __DIR__ . '/../controllers/EquipmentBrowseController.php';
require_once __DIR__ . '/../controllers/EquipmentTypeRequestController.php';

try {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']),
    ]);
    session_start();

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    // State-changing requests must be JSON. A cross-site <form> can't send
    // application/json without a CORS preflight, which is a cheap CSRF barrier
    // on top of the SameSite=Lax session cookie.
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
        if (strpos($type, 'application/json') !== 0) {
            Response::error('Content-Type must be application/json.', 415);
        }
    }

    // Path relative to this script's folder, e.g. /equipify/backend/api/auth/me -> /auth/me
    $uriPath = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $base    = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    // Case-insensitive: Windows serves /equipify/... and /Equipify/... alike.
    $path    = rawurldecode(stripos($uriPath, $base) === 0 ? substr($uriPath, strlen($base)) : $uriPath);
    if (strpos($path, '/index.php') === 0) {
        $path = substr($path, strlen('/index.php'));
    }

    $router = new Router();
    require __DIR__ . '/../routes.php';
    $router->dispatch($method, $path);
} catch (Throwable $e) {
    error_log('Equipify API error: ' . $e);
    Response::error('Something went wrong. Please try again.', 500);
}
