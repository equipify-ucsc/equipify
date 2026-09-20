<?php
/**
 * Customer and renting-party sign-up, login, logout and "who am I". Thin: read input -> validate
 * -> call model/service -> respond.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../services/CustomerRegistrationService.php';
require_once __DIR__ . '/../services/RentingPartyRegistrationService.php';
require_once __DIR__ . '/../models/RentingPartyModel.php';
require_once __DIR__ . '/../core/Upload.php';

final class AuthController
{
    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    private const MAX_UPLOAD_BYTES = 2097152; // 2 MB per file (both ride in one JSON body)

    /** POST /auth/register — always creates a customer; role is never read from the request. */
    public static function register(array $params = []): void
    {
        $in = Router::jsonBody();

        $fullName = self::str($in, 'full_name');
        $email    = strtolower(self::str($in, 'email'));
        $phoneRaw = self::str($in, 'phone');
        $company  = self::str($in, 'company');
        $address  = self::str($in, 'address');
        $district = self::str($in, 'district');
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';
        $confirm  = is_string($in['confirm_password'] ?? null) ? $in['confirm_password'] : '';

        $errors = [];
        $checks = [
            'full_name' => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'email'     => Validator::email($email),
            'phone'     => Validator::phone($phoneRaw),
            'company'   => Validator::maxLength($company, 150, 'Company name'),
            'address'   => Validator::required($address, 'Address') ?? Validator::maxLength($address, 255, 'Address'),
            'district'  => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'password'  => Validator::password($password),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if (!isset($errors['password']) && $password !== $confirm) {
            $errors['confirm_password'] = 'Passwords do not match.';
        }
        if (($in['terms'] ?? false) !== true) {
            $errors['terms'] = 'You must accept the Terms of Service and Privacy Policy.';
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
            $userId = CustomerRegistrationService::register([
                'email'     => $email,
                'password'  => $password,
                'full_name' => $fullName,
                'phone'     => $phone,
                'address'   => $address,
                'district'  => $district,
                'company'   => $company === '' ? null : $company,
            ]);
        } catch (PDOException $e) {
            // Lost a race with another sign-up for the same email/phone.
            if ($e->getCode() === '23000') {
                Response::error('An account with this email or phone number already exists.', 422);
            }
            throw $e;
        }

        Auth::login($userId, 'customer');
        Response::ok(['user_id' => $userId, 'role' => 'customer', 'full_name' => $fullName], 201);
    }

    /**
     * POST /auth/register/renting-party — always creates a renting party (pending
     * verification); role is never read from the request. The BR certificate and
     * optional logo are base64 inside the JSON body, see core/Upload.php.
     */
    public static function registerRentingParty(array $params = []): void
    {
        $in = Router::jsonBody();

        $businessName = self::str($in, 'business_name');
        $ownerName    = self::str($in, 'owner_name');
        $regNo        = self::str($in, 'reg_no');
        $email        = strtolower(self::str($in, 'email'));
        $phoneRaw     = self::str($in, 'phone');
        $district     = self::str($in, 'district');
        $address      = self::str($in, 'address');
        $password     = is_string($in['password'] ?? null) ? $in['password'] : '';
        $confirm      = is_string($in['confirm_password'] ?? null) ? $in['confirm_password'] : '';

        $errors = [];
        $checks = [
            'business_name' => Validator::required($businessName, 'Business name') ?? Validator::maxLength($businessName, 150, 'Business name'),
            'owner_name'    => Validator::required($ownerName, 'Owner name') ?? Validator::maxLength($ownerName, 150, 'Owner name'),
            'reg_no'        => Validator::required($regNo, 'Registration number') ?? Validator::maxLength($regNo, 50, 'Registration number'),
            'email'         => Validator::email($email),
            'phone'         => Validator::phone($phoneRaw),
            'district'      => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'address'       => Validator::required($address, 'Business address') ?? Validator::maxLength($address, 255, 'Business address'),
            'password'      => Validator::password($password),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if (!isset($errors['password']) && $password !== $confirm) {
            $errors['confirm_password'] = 'Passwords do not match.';
        }
        if (($in['terms'] ?? false) !== true) {
            $errors['terms'] = 'You must accept the Terms of Service and Privacy Policy.';
        }

        $certificate = Upload::prepare($in['br_certificate'] ?? null, Upload::DOCUMENTS, self::MAX_UPLOAD_BYTES, 'Registration certificate');
        if (is_string($certificate)) {
            $errors['br_certificate'] = $certificate;
        }
        $logo = null;
        if (($in['logo'] ?? null) !== null) {
            $logo = Upload::prepare($in['logo'], Upload::IMAGES, self::MAX_UPLOAD_BYTES, 'Business logo');
            if (is_string($logo)) {
                $errors['logo'] = $logo;
                $logo = null;
            }
        }

        $phone = isset($errors['phone']) ? '' : (string) Validator::normalizePhone($phoneRaw);

        if (!isset($errors['email']) && UserModel::emailExists($email)) {
            $errors['email'] = 'An account with this email already exists.';
        }
        if (!isset($errors['phone']) && UserModel::phoneExists($phone)) {
            $errors['phone'] = 'An account with this phone number already exists.';
        }
        if (!isset($errors['reg_no']) && RentingPartyModel::regNoExists($regNo)) {
            $errors['reg_no'] = 'A business with this registration number is already registered.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        try {
            $userId = RentingPartyRegistrationService::register([
                'email'         => $email,
                'password'      => $password,
                'owner_name'    => $ownerName,
                'phone'         => $phone,
                'business_name' => $businessName,
                'reg_no'        => $regNo,
                'address'       => $address,
                'district'      => $district,
            ], $certificate, $logo);
        } catch (PDOException $e) {
            // Lost a race with another sign-up for the same email/phone/registration number.
            if ($e->getCode() === '23000') {
                Response::error('An account with this email, phone number or registration number already exists.', 422);
            }
            throw $e;
        }

        Auth::login($userId, 'renting_party');
        Response::ok(['user_id' => $userId, 'role' => 'renting_party', 'full_name' => $ownerName], 201);
    }

    /** POST /auth/login */
    public static function login(array $params = []): void
    {
        $in       = Router::jsonBody();
        $email    = strtolower(self::str($in, 'email'));
        $password = is_string($in['password'] ?? null) ? $in['password'] : '';

        // Each login page only signs in its own kind of account; omitted = customer.
        $role = $in['portal'] ?? 'customer';
        if (!in_array($role, ['customer', 'renting_party'], true)) {
            Response::error('Unknown login portal.', 422);
        }

        if (Validator::email($email) !== null || $password === '') {
            Response::error('Enter your email and password.', 422);
        }

        $user = UserModel::findByEmail($email);

        // Verify against a dummy hash for unknown emails so response time doesn't
        // reveal which emails are registered.
        $hash = $user['password_hash'] ?? password_hash('equipify-dummy-password', PASSWORD_DEFAULT);
        $valid = password_verify($password, $hash);

        // Same message for unknown email, wrong password and accounts of another role.
        if ($user === null || !$valid || $user['role'] !== $role) {
            Response::error('Incorrect email or password.', 401);
        }
        if ($user['account_status'] !== 'active') {
            Response::error('This account is not active. Please contact support.', 403);
        }

        $userId = (int) $user['user_id'];
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            UserModel::updatePasswordHash($userId, password_hash($password, PASSWORD_DEFAULT));
        }
        UserModel::touchLastLogin($userId);
        Auth::login($userId, $role);

        Response::ok(['user_id' => $userId, 'role' => $role, 'full_name' => $user['full_name']]);
    }

    /** POST /auth/logout */
    public static function logout(array $params = []): void
    {
        Auth::logout();
        Response::ok(null);
    }

    /** GET /auth/me — 401 when there is no valid session. */
    public static function me(array $params = []): void
    {
        $userId = Auth::userId();
        $user = $userId === null ? null : UserModel::findById($userId);

        if ($user === null || $user['account_status'] !== 'active') {
            if ($userId !== null) {
                Auth::logout();
            }
            Response::error('Please log in to continue.', 401);
        }

        Response::ok([
            'user_id'   => (int) $user['user_id'],
            'role'      => $user['role'],
            'full_name' => $user['full_name'],
            'email'     => $user['email'],
        ]);
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
