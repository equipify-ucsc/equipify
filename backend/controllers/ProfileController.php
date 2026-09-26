<?php
/**
 * The signed-in user's own profile, for every role except the freelance
 * worker (which keeps its richer /freelancer/profile), plus the profile photo
 * for all seven roles.
 *
 * Each role only edits the columns it owns:
 *   everyone            full_name, phone
 *   customer            + company_name, address_line, district
 *   renting_party       + business_name, business_address, district, description
 *   maintenance_tech    + nic_number, address_line, bio, years_experience, specialization
 *   delivery_personnel  + nic_number, address_line
 * Email, role, account status, ratings and verification are never taken from
 * the request. Area managers and their staff don't edit their district: it is
 * assigned, and staff inherit their area manager's.
 *
 * The user is always taken from the session, never from the request, so there
 * is no way to read or write someone else's row.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/CustomerModel.php';
require_once __DIR__ . '/../models/RentingPartyModel.php';
require_once __DIR__ . '/../models/MaintenanceTechModel.php';
require_once __DIR__ . '/../models/DeliveryPersonnelModel.php';
require_once __DIR__ . '/../core/Upload.php';

final class ProfileController
{
    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    private const MAX_PHOTO_BYTES = 2097152; // 2 MB

    private const PHOTO_TYPES = [
        'jpg'  => 'image/jpeg',
        'png'  => 'image/png',
        'webp' => 'image/webp',
    ];

    /** GET /profile */
    public static function show(array $params = []): void
    {
        Response::ok(self::load((int) Auth::userId(), (string) Auth::role()));
    }

    /** PUT /profile */
    public static function update(array $params = []): void
    {
        $userId  = (int) Auth::userId();
        $role    = (string) Auth::role();
        $in      = Router::jsonBody();
        $account = UserModel::findAccount($userId);
        if ($account === null) {
            Response::error('Profile not found.', 404);
        }

        $fullName = self::str($in, 'full_name');
        $phoneRaw = self::str($in, 'phone');

        $checks = [
            'full_name' => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'phone'     => Validator::phone($phoneRaw),
        ];

        // users columns this role doesn't own keep their stored value.
        $nic      = $account['nic_number'];
        $address  = $account['address_line'];
        $district = $account['district'];

        $ownsNic      = in_array($role, ['maintenance_tech', 'delivery_personnel'], true);
        $ownsAddress  = in_array($role, ['customer', 'maintenance_tech', 'delivery_personnel'], true);
        $ownsDistrict = in_array($role, ['customer', 'renting_party'], true);

        if ($ownsNic) {
            $nicRaw = self::str($in, 'nic_number');
            // Staff are registered without one, so it stays optional here.
            $checks['nic_number'] = $nicRaw === '' ? null : Validator::nic($nicRaw);
            $nic = ($nicRaw === '' || $checks['nic_number'] !== null) ? null : Validator::normalizeNic($nicRaw);
        }
        if ($ownsAddress) {
            $address = self::str($in, 'address_line');
            $checks['address_line'] = $role === 'customer'
                ? (Validator::required($address, 'Address') ?? Validator::maxLength($address, 255, 'Address'))
                : Validator::maxLength($address, 255, 'Address');
        }
        if ($ownsDistrict) {
            $district = self::str($in, 'district');
            $checks['district'] = Validator::oneOf($district, self::DISTRICTS, 'district');
        }

        // Subtype columns.
        $company = $businessName = $businessAddress = $description = $bio = $specialization = '';
        $experience = null;
        if ($role === 'customer') {
            $company = self::str($in, 'company_name');
            $checks['company_name'] = Validator::maxLength($company, 150, 'Company name');
        } elseif ($role === 'renting_party') {
            $businessName    = self::str($in, 'business_name');
            $businessAddress = self::str($in, 'business_address');
            $description     = self::str($in, 'description');
            $checks['business_name']    = Validator::required($businessName, 'Business name') ?? Validator::maxLength($businessName, 150, 'Business name');
            $checks['business_address'] = Validator::required($businessAddress, 'Business address') ?? Validator::maxLength($businessAddress, 255, 'Business address');
            $checks['description']      = Validator::maxLength($description, 2000, 'Description');
        } elseif ($role === 'maintenance_tech') {
            $bio            = self::str($in, 'bio');
            $specialization = self::str($in, 'specialization');
            $experience     = $in['years_experience'] ?? null;
            $checks['bio']              = Validator::maxLength($bio, 2000, 'Bio');
            $checks['specialization']   = Validator::maxLength($specialization, 150, 'Specialization');
            $checks['years_experience'] = Validator::intRange($experience, 0, 70, 'Years of experience');
        }

        $errors = array_filter($checks, function ($message) { return $message !== null; });

        $phone = isset($errors['phone']) ? '' : (string) Validator::normalizePhone($phoneRaw);
        if (!isset($errors['phone']) && UserModel::phoneTakenByOther($phone, $userId)) {
            $errors['phone'] = 'Another account already uses this phone number.';
        }
        if ($ownsNic && $nic !== null && !isset($errors['nic_number']) && UserModel::nicTakenByOther($nic, $userId)) {
            $errors['nic_number'] = 'Another account already uses this NIC number.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $db = getDbConnection();
        $db->beginTransaction();
        try {
            UserModel::updateProfile($userId, [
                'full_name'    => $fullName,
                'phone'        => $phone,
                'nic_number'   => $nic,
                'address_line' => ($address === '' ? null : $address),
                'district'     => $district,
            ]);
            if ($role === 'customer') {
                CustomerModel::updateDetails($userId, $company === '' ? null : $company, $address);
            } elseif ($role === 'renting_party') {
                RentingPartyModel::updateDetails($userId, [
                    'business_name'    => $businessName,
                    'business_address' => $businessAddress,
                    'district'         => $district,
                    'description'      => $description === '' ? null : $description,
                ]);
            } elseif ($role === 'maintenance_tech') {
                MaintenanceTechModel::updateDetails($userId, [
                    'bio'              => $bio === '' ? null : $bio,
                    'years_experience' => ($experience === null || $experience === '') ? null : (int) $experience,
                    'specialization'   => $specialization === '' ? null : $specialization,
                ]);
            }
            $db->commit();
        } catch (PDOException $e) {
            $db->rollBack();
            // Lost a race with another account claiming the same phone/NIC.
            if ($e->getCode() === '23000') {
                Response::error('Another account already uses this phone number or NIC.', 422);
            }
            throw $e;
        }

        Response::ok(self::load($userId, $role));
    }

    /** POST /profile/photo — body {photo: {name, data}}; replaces any earlier photo. */
    public static function uploadPhoto(array $params = []): void
    {
        $userId   = (int) Auth::userId();
        $in       = Router::jsonBody();
        $prepared = Upload::prepare($in['photo'] ?? null, Upload::IMAGES, self::MAX_PHOTO_BYTES, 'Profile photo');
        if (is_string($prepared)) {
            Response::error($prepared, 422, ['photo' => $prepared]);
        }

        $old  = UserModel::profilePhotoPath($userId);
        $path = Upload::store($prepared, 'profile-photos');
        try {
            UserModel::setProfilePhoto($userId, $path);
        } catch (Throwable $e) {
            Upload::discard($path);
            throw $e;
        }
        if ($old !== null) {
            Upload::discard($old);
        }

        Response::ok(['photo_url' => self::photoUrl($path)]);
    }

    /** DELETE /profile/photo */
    public static function deletePhoto(array $params = []): void
    {
        $userId = (int) Auth::userId();
        $old    = UserModel::profilePhotoPath($userId);
        UserModel::setProfilePhoto($userId, null);
        if ($old !== null) {
            Upload::discard($old);
        }
        Response::ok(['photo_url' => null]);
    }

    /** GET /profile/photo — streams the signed-in user's own photo. */
    public static function showPhoto(array $params = []): void
    {
        $relative = UserModel::profilePhotoPath((int) Auth::userId());
        $ext      = $relative === null ? '' : strtolower((string) pathinfo($relative, PATHINFO_EXTENSION));
        $full     = $relative === null ? '' : __DIR__ . '/../storage/' . $relative;

        // A path that didn't come out of Upload::store(), or a file that has
        // since been removed, is a 404 rather than a leak of the filesystem.
        if ($relative === null
            || strpos($relative, 'profile-photos/') !== 0
            || !Upload::isStoredPath($relative)
            || !isset(self::PHOTO_TYPES[$ext])
            || !is_file($full)
        ) {
            Response::error('Photo not found.', 404);
        }

        header('Content-Type: ' . self::PHOTO_TYPES[$ext]);
        header('Content-Length: ' . (string) filesize($full));
        header('Content-Disposition: inline');
        // The URL carries ?v=<file name>, so a replaced photo is a new URL and
        // the old one may be cached; "private" keeps shared caches out of it.
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        readfile($full);
        exit;
    }

    /**
     * The API path the frontend loads a stored photo from, or null. The version
     * is the random file name, so a new upload gets a new URL.
     */
    public static function photoUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }
        return '/profile/photo?v=' . rawurlencode((string) pathinfo($path, PATHINFO_FILENAME));
    }

    /** The GET /profile shape: common account fields plus the role's own. */
    private static function load(int $userId, string $role): array
    {
        $account = UserModel::findAccount($userId);
        if ($account === null) {
            Response::error('Profile not found.', 404);
        }

        $profile = [
            'user_id'        => (int) $account['user_id'],
            'role'           => $account['role'],
            'full_name'      => $account['full_name'],
            'email'          => $account['email'],
            'phone'          => $account['phone'],
            'nic_number'     => $account['nic_number'],
            'address_line'   => $account['address_line'],
            'district'       => $account['district'],
            'account_status' => $account['account_status'],
            'last_login_at'  => $account['last_login_at'],
            'member_since'   => $account['created_at'],
            'photo_url'      => self::photoUrl($account['profile_photo_url']),
        ];

        if ($role === 'customer') {
            $d = CustomerModel::findDetails($userId) ?? [];
            $fwAvg   = (float) ($d['freelancer_avg_rating'] ?? 0);
            $fwCount = (int) ($d['freelancer_rating_count'] ?? 0);
            $rpAvg   = (float) ($d['renting_party_avg_rating'] ?? 0);
            $rpCount = (int) ($d['renting_party_rating_count'] ?? 0);
            $count   = $fwCount + $rpCount;
            $profile += [
                'company_name'               => $d['company_name'] ?? null,
                'freelancer_avg_rating'      => $fwAvg,
                'freelancer_rating_count'    => $fwCount,
                'renting_party_avg_rating'   => $rpAvg,
                'renting_party_rating_count' => $rpCount,
                // Both sources combined, weighted by how many ratings each has.
                'avg_rating'                 => $count === 0 ? 0.0 : round(($fwAvg * $fwCount + $rpAvg * $rpCount) / $count, 2),
                'rating_count'               => $count,
            ];
            // Older customer rows may only have the billing address.
            $profile['address_line'] = $account['address_line'] ?? ($d['billing_address'] ?? null);
        } elseif ($role === 'renting_party') {
            $d = RentingPartyModel::findDetails($userId) ?? [];
            $profile['district'] = $d['district'] ?? $account['district'];
            $profile += [
                'business_name'       => $d['business_name'] ?? null,
                'business_reg_no'     => $d['business_reg_no'] ?? null,
                'business_address'    => $d['business_address'] ?? null,
                'description'         => $d['description'] ?? null,
                'verification_status' => $d['verification_status'] ?? null,
                'avg_rating'          => (float) ($d['avg_rating'] ?? 0),
                'rating_count'        => (int) ($d['rating_count'] ?? 0),
            ];
        } elseif ($role === 'maintenance_tech') {
            $d = MaintenanceTechModel::findDetails($userId) ?? [];
            $profile += [
                'bio'                 => $d['bio'] ?? null,
                'years_experience'    => isset($d['years_experience']) ? (int) $d['years_experience'] : null,
                'specialization'      => $d['specialization'] ?? null,
                'availability_status' => $d['availability_status'] ?? null,
            ];
        } elseif ($role === 'delivery_personnel') {
            $d = DeliveryPersonnelModel::findDetails($userId) ?? [];
            $profile += [
                'driving_license_no'  => $d['driving_license_no'] ?? null,
                'license_class'       => $d['license_class'] ?? null,
                'license_expiry'      => $d['license_expiry'] ?? null,
                'availability_status' => $d['availability_status'] ?? null,
            ];
        }

        return $profile;
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
