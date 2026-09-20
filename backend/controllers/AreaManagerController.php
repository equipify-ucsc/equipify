<?php
/**
 * Admin-only management of area managers. There is no public sign-up for this
 * role: routes.php restricts these endpoints to the admin role.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/AreaManagerModel.php';
require_once __DIR__ . '/../services/AreaManagerRegistrationService.php';

final class AreaManagerController
{
    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    /** GET /admin/area-managers */
    public static function index(array $params = []): void
    {
        Response::ok(AreaManagerModel::all());
    }

    /** POST /admin/area-managers — the registering admin is taken from the session. */
    public static function store(array $params = []): void
    {
        $in = Router::jsonBody();

        $fullName = self::str($in, 'full_name');
        $email    = strtolower(self::str($in, 'email'));
        $phoneRaw = self::str($in, 'phone');
        $district = self::str($in, 'district');
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';

        $errors = [];
        $checks = [
            'full_name' => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'email'     => Validator::email($email),
            'phone'     => Validator::phone($phoneRaw),
            'district'  => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'password'  => Validator::password($password),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }

        $phone = isset($errors['phone']) ? '' : (string) Validator::normalizePhone($phoneRaw);

        if (!isset($errors['email']) && UserModel::emailExists($email)) {
            $errors['email'] = 'An account with this email already exists.';
        }
        if (!isset($errors['phone']) && UserModel::phoneExists($phone)) {
            $errors['phone'] = 'An account with this phone number already exists.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        try {
            $userId = AreaManagerRegistrationService::register([
                'email'     => $email,
                'password'  => $password,
                'full_name' => $fullName,
                'phone'     => $phone,
                'district'  => $district,
            ], (int) Auth::userId());
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                Response::error('An account with this email or phone number already exists.', 422);
            }
            throw $e;
        }

        Response::ok(['user_id' => $userId, 'role' => 'area_manager', 'full_name' => $fullName], 201);
    }

    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
