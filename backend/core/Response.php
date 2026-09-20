<?php
/**
 * The one response shape used by every endpoint:
 *
 *     {"success": true,  "data": ...}
 *     {"success": false, "error": "...", "fields": {"email": "..."}}   // fields optional
 *
 * Both helpers send the JSON and end the request.
 */

declare(strict_types=1);

final class Response
{
    /** @param mixed $data anything json_encode can handle */
    public static function ok($data = null, int $status = 200): void
    {
        self::send($status, ['success' => true, 'data' => $data]);
    }

    /**
     * @param array<string,string> $fields per-field messages (e.g. validation
     *                                     failures) so the page can mark inputs
     */
    public static function error(string $message, int $status = 400, array $fields = []): void
    {
        $body = ['success' => false, 'error' => $message];
        if ($fields !== []) {
            $body['fields'] = $fields;
        }
        self::send($status, $body);
    }

    private static function send(int $status, array $body): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}
