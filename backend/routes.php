<?php
/**
 * One line per endpoint: method, path, handler, allowed roles (omit = public).
 * Loaded by api/index.php with $router in scope.
 */

declare(strict_types=1);

// Auth
$router->add('POST', '/auth/register', [AuthController::class, 'register']);
$router->add('POST', '/auth/login',    [AuthController::class, 'login']);
$router->add('POST', '/auth/logout',   [AuthController::class, 'logout']);
$router->add('GET',  '/auth/me',       [AuthController::class, 'me']);
