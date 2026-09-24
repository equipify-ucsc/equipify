<?php
/**
 * Area-manager-only management of maintenance technicians. There is no public
 * sign-up for this role: routes.php restricts these endpoints to the
 * area_manager role, and each manager only ever sees or touches the roster
 * they registered.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/AreaManagerModel.php';
require_once __DIR__ . '/../models/MaintenanceTechModel.php';
require_once __DIR__ . '/../models/EquipmentCategoryModel.php';
require_once __DIR__ . '/../services/MaintenanceTechRegistrationService.php';

final class MaintenanceTechController
{
    private const MAX_YEARS_EXPERIENCE = 70;

    /** GET /area-manager/technicians */
    public static function index(array $params = []): void
    {
        Response::ok(MaintenanceTechModel::allForManager((int) Auth::userId()));
    }

    /**
     * POST /area-manager/technicians — the registering area manager is taken
     * from the session, and the new account inherits that manager's district
     * (the form does not ask for one).
     */
    public static function store(array $params = []): void
    {
        $in = Router::jsonBody();

        $fullName       = self::str($in, 'full_name');
        $email          = strtolower(self::str($in, 'email'));
        $phoneRaw       = self::str($in, 'phone');
        $password       = is_string($in['password'] ?? null) ? $in['password'] : '';

        $errors = [];
        $checks = [
            'full_name'      => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'email'          => Validator::email($email),
            'phone'          => Validator::phone($phoneRaw),
            'password'       => Validator::password($password),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }

        // Categories serviced: picked from the equipment catalogue. The names
        // are also kept as display text in maintenance_techs.specialization.
        [$categoryIds, $specialization] = self::readCategories($in['category_ids'] ?? null);
        if ($categoryIds === []) {
            $errors['category_ids'] = 'Select at least one equipment category this technician services.';
        }

        // Optional: the form does not ask for it yet, but the column exists.
        $years = null;
        if (($in['years_experience'] ?? null) !== null && $in['years_experience'] !== '') {
            $raw = filter_var($in['years_experience'], FILTER_VALIDATE_INT);
            if ($raw === false || $raw < 0 || $raw > self::MAX_YEARS_EXPERIENCE) {
                $errors['years_experience'] = 'Years of experience must be a whole number between 0 and ' . self::MAX_YEARS_EXPERIENCE . '.';
            } else {
                $years = $raw;
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

        $managerId = (int) Auth::userId();

        try {
            $userId = MaintenanceTechRegistrationService::register([
                'email'            => $email,
                'password'         => $password,
                'full_name'        => $fullName,
                'phone'            => $phone,
                'district'         => AreaManagerModel::districtOf($managerId),
                'specialization'   => $specialization,
                'years_experience' => $years,
                'category_ids'     => $categoryIds,
            ], $managerId);
        } catch (PDOException $e) {
            // Lost a race with another registration for the same email/phone.
            if ($e->getCode() === '23000') {
                Response::error('An account with this email or phone number already exists.', 422);
            }
            throw $e;
        }

        Response::ok(['user_id' => $userId, 'role' => 'maintenance_tech', 'full_name' => $fullName], 201);
    }

    /**
     * Keeps only ids of active catalogue categories, de-duplicated, and builds
     * the display text from their names (cut to fit VARCHAR(150)).
     *
     * @param mixed $raw
     * @return array{0:int[],1:string} category ids and "Name, Name, ..."
     */
    private static function readCategories($raw): array
    {
        if (!is_array($raw)) {
            return [[], ''];
        }
        $active = [];
        foreach (EquipmentCategoryModel::categories(true) as $category) {
            $active[(int) $category['category_id']] = (string) $category['name'];
        }
        $ids = [];
        foreach ($raw as $value) {
            $id = filter_var($value, FILTER_VALIDATE_INT);
            if ($id !== false && isset($active[$id])) {
                $ids[$id] = $id;
            }
        }
        $ids   = array_values($ids);
        $names = implode(', ', array_map(static fn (int $id): string => $active[$id], $ids));
        return [$ids, mb_strlen($names) > 150 ? mb_substr($names, 0, 149) . '…' : $names];
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
