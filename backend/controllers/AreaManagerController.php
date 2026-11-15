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

    public static function requireOperationalArea(): array
    {
        try { return AreaManagerModel::operationalArea((int) Auth::userId()); }
        catch (DomainException $e) { Response::error($e->getMessage(), 409); }
    }

    public static function areaContext(array $params = []): void
    {
        Response::ok(self::requireOperationalArea());
    }

    /** GET /admin/area-managers */
    public static function index(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        Response::ok(AreaManagerModel::all());
    }

    /** POST /admin/area-managers — the registering admin is taken from the session. */
    public static function store(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
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

    /** PUT /admin/area-managers/{id}/area; null explicitly clears assignment. */
    public static function assignArea(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        $rawId = $params['id'] ?? '';
        $id = is_string($rawId) && preg_match('/\A[1-9][0-9]*\z/', $rawId)
            ? filter_var($rawId, FILTER_VALIDATE_INT) : false;
        if ($id === false) Response::error('Invalid area manager ID.', 422);
        $in = Router::jsonBody();
        if (!array_key_exists('area_id', $in) || array_diff(array_keys($in), ['area_id'])) {
            Response::error('Provide area_id, or null to unassign.', 422, ['area_id' => 'Provide only area_id.']);
        }
        // JSON numbers must be positive integers; reject booleans, floats and strings.
        $areaId = $in['area_id'];
        if ($areaId !== null && (!is_int($areaId) || $areaId < 1)) {
            Response::error('Select a valid area.', 422, ['area_id' => 'Use a positive integer or null.']);
        }
        try { $manager = AreaManagerModel::assignArea($id, $areaId); }
        catch (DomainException $e) {
            Response::error($e->getMessage(), $e->getCode(), $e->getCode() === 422 ? ['area_id' => $e->getMessage()] : []);
        }
        Response::ok($manager);
    }

    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
