<?php
/**
 * Area-manager-only management of delivery personnel. There is no public
 * sign-up for this role: routes.php restricts these endpoints to the
 * area_manager role, and each manager only ever sees or touches the roster
 * they registered.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/AreaManagerModel.php';
require_once __DIR__ . '/../models/DeliveryPersonnelModel.php';
require_once __DIR__ . '/../services/DeliveryPersonnelRegistrationService.php';

final class DeliveryPersonnelController
{
    /** Sri Lankan driving licence classes. */
    private const LICENSE_CLASSES = [
        'A1', 'A', 'B1', 'B', 'C1', 'C', 'CE', 'D1', 'D', 'DE', 'G1', 'G', 'J',
    ];

    /** GET /area-manager/delivery-personnel */
    public static function index(array $params = []): void
    {
        Response::ok(DeliveryPersonnelModel::allForManager((int) Auth::userId()));
    }

    /**
     * POST /area-manager/delivery-personnel — the registering area manager is
     * taken from the session, and the new account inherits that manager's
     * district (the form does not ask for one).
     */
    public static function store(array $params = []): void
    {
        $in = Router::jsonBody();

        $fullName     = self::str($in, 'full_name');
        $email        = strtolower(self::str($in, 'email'));
        $phoneRaw     = self::str($in, 'phone');
        $licenseNo    = strtoupper(self::str($in, 'driving_license_no'));
        $licenseClass = strtoupper(self::str($in, 'license_class'));
        $licenseExp   = self::str($in, 'license_expiry');
        $password     = is_string($in['password'] ?? null) ? $in['password'] : '';

        $errors = [];
        $checks = [
            'full_name'          => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'email'              => Validator::email($email),
            'phone'              => Validator::phone($phoneRaw),
            'driving_license_no' => Validator::required($licenseNo, 'Driving license number') ?? Validator::maxLength($licenseNo, 20, 'Driving license number'),
            'license_class'      => Validator::oneOf($licenseClass, self::LICENSE_CLASSES, 'license class'),
            'license_expiry'     => Validator::futureDate($licenseExp, 'License expiry'),
            'password'           => Validator::password($password),
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
        if (!isset($errors['driving_license_no']) && DeliveryPersonnelModel::licenseExists($licenseNo)) {
            $errors['driving_license_no'] = 'This driving license number is already registered.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $managerId = (int) Auth::userId();

        try {
            $userId = DeliveryPersonnelRegistrationService::register([
                'email'              => $email,
                'password'           => $password,
                'full_name'          => $fullName,
                'phone'              => $phone,
                'district'           => AreaManagerModel::districtOf($managerId),
                'driving_license_no' => $licenseNo,
                'license_class'      => $licenseClass,
                'license_expiry'     => $licenseExp,
            ], $managerId);
        } catch (PDOException $e) {
            // Lost a race with another registration for the same email/phone/license.
            if ($e->getCode() === '23000') {
                Response::error('An account with this email, phone number or license already exists.', 422);
            }
            throw $e;
        }

        Response::ok(['user_id' => $userId, 'role' => 'delivery_personnel', 'full_name' => $fullName], 201);
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
