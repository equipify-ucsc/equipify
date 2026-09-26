<?php
/**
 * The signed-in freelance worker's own profile and credential documents.
 * Everything here is backed by real tables (`users`, `freelance_workers`,
 * `credential_docs`); the parts of the portal that need tables the schema does
 * not have yet live in FreelanceWorkerMockController.
 *
 * The worker is always taken from the session, never from the request, so
 * there is no way to read or write someone else's row.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/FreelanceWorkerModel.php';
require_once __DIR__ . '/../models/CredentialDocModel.php';
require_once __DIR__ . '/../models/PortfolioItemModel.php';
require_once __DIR__ . '/../core/Upload.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/ProfileController.php';

final class FreelanceWorkerController
{
    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    /** freelance_workers.availability_status */
    private const AVAILABILITY = ['available', 'busy', 'unavailable'];

    /** credential_docs.verification_status */
    private const DOC_STATUSES = ['pending', 'verified', 'rejected'];

    /**
     * credential_docs.doc_type, minus 'business_registration', which belongs
     * to renting parties and is attached at their sign-up.
     */
    private const DOC_TYPES = ['nic', 'driving_license', 'professional_certificate', 'other'];

    private const MAX_UPLOAD_BYTES = 2097152; // 2 MB, same ceiling as renting-party sign-up

    /** Portfolio photos are shown on screen, so they are images only. */
    private const MAX_PHOTO_BYTES = 3145728; // 3 MB

    /** Extension => Content-Type, for streaming a stored portfolio photo back. */
    private const PHOTO_TYPES = [
        'jpg'  => 'image/jpeg',
        'png'  => 'image/png',
        'webp' => 'image/webp',
    ];

    /** GET /freelancer/profile */
    public static function showProfile(array $params = []): void
    {
        $profile = FreelanceWorkerModel::findProfile((int) Auth::userId());
        if ($profile === null) {
            Response::error('Profile not found.', 404);
        }
        Response::ok(self::presentProfile($profile));
    }

    /**
     * PUT /freelancer/profile: the worker's own editable fields only.
     * verification_status, avg_rating and rating_count are ignored if sent:
     * the platform owns those.
     */
    public static function updateProfile(array $params = []): void
    {
        $userId = (int) Auth::userId();
        $in     = Router::jsonBody();

        $fullName     = self::str($in, 'full_name');
        $phoneRaw     = self::str($in, 'phone');
        $nicRaw       = self::str($in, 'nic_number');
        $address      = self::str($in, 'address_line');
        $district     = self::str($in, 'district');
        $bio          = self::str($in, 'bio');
        $availability = self::str($in, 'availability_status');
        $experience   = $in['years_experience'] ?? null;

        $errors = [];
        $checks = [
            'full_name'           => Validator::required($fullName, 'Full name') ?? Validator::maxLength($fullName, 150, 'Full name'),
            'phone'               => Validator::phone($phoneRaw),
            'nic_number'          => Validator::nic($nicRaw),
            'address_line'        => Validator::required($address, 'Address') ?? Validator::maxLength($address, 255, 'Address'),
            'district'            => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'bio'                 => Validator::maxLength($bio, 2000, 'Bio'),
            'availability_status' => Validator::oneOf($availability, self::AVAILABILITY, 'availability'),
            'years_experience'    => Validator::intRange($experience, 0, 70, 'Years of experience'),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }

        $phone = isset($errors['phone']) ? '' : (string) Validator::normalizePhone($phoneRaw);
        $nic   = isset($errors['nic_number']) ? '' : (string) Validator::normalizeNic($nicRaw);

        if (!isset($errors['phone']) && UserModel::phoneTakenByOther($phone, $userId)) {
            $errors['phone'] = 'Another account already uses this phone number.';
        }
        if (!isset($errors['nic_number']) && UserModel::nicTakenByOther($nic, $userId)) {
            $errors['nic_number'] = 'Another account already uses this NIC number.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        try {
            UserModel::updateProfile($userId, [
                'full_name'    => $fullName,
                'phone'        => $phone,
                'nic_number'   => $nic,
                'address_line' => $address,
                'district'     => $district,
            ]);
            FreelanceWorkerModel::updateProfile($userId, [
                'bio'                 => $bio === '' ? null : $bio,
                'years_experience'    => ($experience === null || $experience === '') ? null : (int) $experience,
                'availability_status' => $availability,
            ]);
        } catch (PDOException $e) {
            // Lost a race with another account claiming the same phone/NIC.
            if ($e->getCode() === '23000') {
                Response::error('Another account already uses this phone number or NIC.', 422);
            }
            throw $e;
        }

        Response::ok(self::presentProfile(FreelanceWorkerModel::findProfile($userId)));
    }

    /**
     * PUT /freelancer/availability: the one-select toggle on the dashboard, so
     * it doesn't have to round-trip the whole profile form.
     */
    public static function updateAvailability(array $params = []): void
    {
        $in     = Router::jsonBody();
        $status = self::str($in, 'availability_status');

        if ($message = Validator::oneOf($status, self::AVAILABILITY, 'availability')) {
            Response::error('Please fix the highlighted fields.', 422, ['availability_status' => $message]);
        }

        FreelanceWorkerModel::updateAvailability((int) Auth::userId(), $status);
        Response::ok(['availability_status' => $status]);
    }

    /** GET /freelancer/documents?status=&doc_type=&page=&per_page= */
    public static function indexDocuments(array $params = []): void
    {
        $userId = (int) Auth::userId();

        $filters = [
            'status'   => ListQuery::enum('status', self::DOC_STATUSES),
            'doc_type' => ListQuery::enum('doc_type', self::DOC_TYPES),
        ];
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage();

        $total = CredentialDocModel::countForUser($userId, $filters);
        $rows  = CredentialDocModel::pageForUser($userId, $filters, $perPage, ($page - 1) * $perPage);

        Response::ok(ListQuery::envelope($rows, $page, $perPage, $total));
    }

    /**
     * POST /freelancer/documents: a PDF or image arrives base64 inside the JSON
     * body (see core/Upload.php). Stored files are never served by URL; the row
     * starts 'pending' until an admin reviews it.
     */
    public static function storeDocument(array $params = []): void
    {
        $in      = Router::jsonBody();
        $docType = self::str($in, 'doc_type');

        $errors = [];
        if ($message = Validator::oneOf($docType, self::DOC_TYPES, 'document type')) {
            $errors['doc_type'] = $message;
        }

        $file = Upload::prepare($in['file'] ?? null, Upload::DOCUMENTS, self::MAX_UPLOAD_BYTES, 'Document');
        if (is_string($file)) {
            $errors['file'] = $file;
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $path = Upload::store($file);
        try {
            CredentialDocModel::insert((int) Auth::userId(), $docType, $path);
        } catch (Throwable $e) {
            Upload::discard($path);
            throw $e;
        }

        Response::ok(['doc_type' => $docType, 'verification_status' => 'pending'], 201);
    }

    // ------------------------------------------------------------- portfolio

    /** GET /freelancer/portfolio?q=&page=&per_page= */
    public static function indexPortfolio(array $params = []): void
    {
        $userId  = (int) Auth::userId();
        $filters = ['q' => ListQuery::search()];
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage(6);

        $total = PortfolioItemModel::countForUser($userId, $filters);
        $rows  = PortfolioItemModel::pageForUser($userId, $filters, $perPage, ($page - 1) * $perPage);

        Response::ok(ListQuery::envelope(
            array_map([self::class, 'presentPortfolioItem'], $rows),
            $page,
            $perPage,
            $total
        ));
    }

    /**
     * POST /freelancer/portfolio: a work sample, with an optional photo that
     * arrives base64 inside the JSON body (see core/Upload.php).
     */
    public static function storePortfolio(array $params = []): void
    {
        $userId = (int) Auth::userId();
        $in     = Router::jsonBody();

        $title       = self::str($in, 'title');
        $equipment   = self::str($in, 'equipment');
        $description = self::str($in, 'description');
        $completedOn = self::str($in, 'completed_on');

        $errors = [];
        $checks = [
            'title'       => Validator::required($title, 'Title') ?? Validator::maxLength($title, 150, 'Title'),
            'equipment'   => Validator::required($equipment, 'Equipment') ?? Validator::maxLength($equipment, 100, 'Equipment'),
            'description' => Validator::maxLength($description, 1000, 'Description'),
        ];
        // The date is optional, but a value that is present has to be a real one
        // and cannot be in the future, since this is work already done.
        if ($completedOn !== '') {
            $checks['completed_on'] = Validator::date($completedOn, 'Completion date')
                ?? (($completedOn > date('Y-m-d')) ? 'Completion date cannot be in the future.' : null);
        }
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }

        // The photo is optional; an absent one is not an error, a broken one is.
        $path = null;
        if (isset($in['image'])) {
            $image = Upload::prepare($in['image'], Upload::IMAGES, self::MAX_PHOTO_BYTES, 'Photo');
            if (is_string($image)) {
                $errors['image'] = $image;
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }
        if (isset($image) && is_array($image)) {
            $path = Upload::store($image);
        }

        try {
            $itemId = PortfolioItemModel::insert($userId, [
                'title'        => $title,
                'equipment'    => $equipment,
                'description'  => $description === '' ? null : $description,
                'image_url'    => $path,
                'completed_on' => $completedOn === '' ? null : $completedOn,
            ]);
        } catch (Throwable $e) {
            // Don't leave an orphaned file behind if the row never lands.
            if ($path !== null) {
                Upload::discard($path);
            }
            throw $e;
        }

        Response::ok(self::presentPortfolioItem(
            (array) PortfolioItemModel::findForUser($itemId, $userId)
        ), 201);
    }

    /**
     * GET /freelancer/portfolio/{id}/image: streams a stored photo.
     *
     * Uploads are not reachable by URL (storage/.htaccess denies the folder),
     * so the only way to the bytes is through here, where the row is fetched
     * with the session's user id in the WHERE clause.
     */
    public static function showPortfolioImage(array $params = []): void
    {
        $itemId = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $item   = $itemId === false || $itemId < 1
            ? null
            : PortfolioItemModel::findForUser($itemId, (int) Auth::userId());

        if ($item === null || $item['image_url'] === null) {
            Response::error('Image not found.', 404);
        }

        $relative = (string) $item['image_url'];
        $full     = __DIR__ . '/../storage/' . $relative;
        $ext      = strtolower((string) pathinfo($relative, PATHINFO_EXTENSION));

        // A path that didn't come out of Upload::store(), or a file that has
        // since been removed, is a 404 rather than a leak of the filesystem.
        if (strpos($relative, 'uploads/') !== 0
            || strpos($relative, '..') !== false
            || !isset(self::PHOTO_TYPES[$ext])
            || !is_file($full)
        ) {
            Response::error('Image not found.', 404);
        }

        header('Content-Type: ' . self::PHOTO_TYPES[$ext]);
        header('Content-Length: ' . (string) filesize($full));
        header('Content-Disposition: inline');
        // The owner is the only viewer, so it may be cached by their browser
        // but never by anything in between.
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        readfile($full);
        exit;
    }

    /**
     * Shapes a portfolio row for the page. The stored path never leaves the
     * server: the page gets the endpoint that serves the bytes instead.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentPortfolioItem(array $row): array
    {
        $id = (int) $row['portfolio_item_id'];
        return [
            'portfolio_item_id' => $id,
            'title'             => $row['title'],
            'equipment'         => $row['equipment'],
            'description'       => $row['description'],
            'completed_on'      => $row['completed_on'],
            'created_at'        => $row['created_at'],
            'image_path'        => $row['image_url'] === null
                ? null
                : '/freelancer/portfolio/' . $id . '/image',
        ];
    }

    /**
     * Shapes a profile row for the page: file paths stay server-side, and the
     * numeric columns come back as numbers rather than PDO's strings.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentProfile(array $row): array
    {
        return [
            'user_id'             => (int) $row['user_id'],
            'full_name'           => $row['full_name'],
            'email'               => $row['email'],
            'phone'               => $row['phone'],
            'nic_number'          => $row['nic_number'],
            'address_line'        => $row['address_line'],
            'district'            => $row['district'],
            'account_status'      => $row['account_status'],
            'member_since'        => $row['created_at'],
            'photo_url'           => ProfileController::photoUrl($row['profile_photo_url']),
            'bio'                 => $row['bio'],
            'years_experience'    => $row['years_experience'] === null ? null : (int) $row['years_experience'],
            'availability_status' => $row['availability_status'],
            'verification_status' => $row['verification_status'],
            'avg_rating'          => (float) $row['avg_rating'],
            'rating_count'        => (int) $row['rating_count'],
        ];
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
