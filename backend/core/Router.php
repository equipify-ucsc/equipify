<?php
/**
 * Maps "METHOD /path" to a controller handler, extracts {param} segments and
 * applies the role gate declared in routes.php.
 *
 *     $router->add('POST', '/auth/login', [AuthController::class, 'login']);
 *     $router->add('GET', '/wishlist', [WishlistController::class, 'index'], ['customer']);
 *
 * Handlers are static methods that receive the path params array and answer via
 * Response (which ends the request).
 */

declare(strict_types=1);

final class Router
{
    /** @var array<int,array{method:string,regex:string,handler:callable,roles:?array}> */
    private array $routes = [];

    /**
     * @param callable      $handler
     * @param string[]|null $roles   null = public; otherwise the allowed roles
     */
    public function add(string $method, string $path, $handler, ?array $roles = null): void
    {
        // "/rentals/{id}/accept" -> "#^/rentals/(?P<id>[^/]+)/accept$#"
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $path);
        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'handler' => $handler,
            'roles'   => $roles,
        ];
    }

    public function dispatch(string $method, string $path): void
    {
        $path = '/' . trim($path, '/');
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (preg_match($route['regex'], $path, $m) !== 1) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== strtoupper($method)) {
                continue;
            }
            if ($route['roles'] !== null) {
                Auth::requireRole($route['roles']);
            }
            $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            call_user_func($route['handler'], $params);
            return;
        }

        if ($pathMatched) {
            Response::error('Method not allowed.', 405);
        }
        Response::error('Not found.', 404);
    }

    /**
     * Decoded JSON request body (empty array when there is none). Malformed
     * JSON ends the request with 400.
     *
     * @return array<string,mixed>
     */
    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            Response::error('Request body must be a JSON object.', 400);
        }
        return $data;
    }
}
