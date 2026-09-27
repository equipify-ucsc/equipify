<?php
/**
 * Complaints raised by the signed-in user.
 *
 * Rows come from backend/fixtures/complaints.json, keyed by role, until the
 * complaints table exists. The vocabularies below — who may complain against
 * whom, the categories, the statuses and the field limits — are the ones the
 * project brief sets out, and they are enforced here rather than trusted from
 * the page.
 *
 * A complaint submitted during a session is kept in $_SESSION so it appears at
 * the top of the list afterwards instead of vanishing on the next load.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/Fixtures.php';
require_once __DIR__ . '/../core/FixtureState.php';

final class ComplaintController
{
    /** Who each role may file a complaint against. */
    private const RULES = [
        'customer'           => ['renting_party', 'freelance_worker', 'delivery_personnel'],
        'renting_party'      => ['customer', 'freelance_worker', 'delivery_personnel'],
        'freelance_worker'   => ['customer'],
        'maintenance_tech'   => ['renting_party'],
        'delivery_personnel' => ['customer'],
    ];

    private const CATEGORIES = [
        'equipment_condition', 'damage_loss', 'payment', 'late_no_show',
        'unsafe_conditions', 'conduct', 'policy_fraud', 'other',
    ];

    private const STATUSES = ['submitted', 'under_review', 'resolved', 'dismissed'];

    private const LIMITS = [
        'against_name' => 150,
        'reference'    => 30,
        'subject'      => 150,
        'details'      => 2000,
    ];

    private const BUCKET = 'complaints.submitted';

    /** GET /complaints?q=&status=&category=&page=&per_page= */
    public static function index(array $params = []): void
    {
        $q        = ListQuery::search();
        $status   = ListQuery::enum('status', self::STATUSES);
        $category = ListQuery::enum('category', self::CATEGORIES);

        $envelope = ListQuery::paginate(
            self::rows(),
            ListQuery::page(),
            ListQuery::perPage(10),
            static function (array $row) use ($q, $status, $category): bool {
                if ($status !== '' && $row['status'] !== $status) {
                    return false;
                }
                if ($category !== '' && $row['category'] !== $category) {
                    return false;
                }
                return ListQuery::contains(
                    $q,
                    (string) $row['reference'],
                    (string) $row['subject'],
                    (string) $row['against_name'],
                    (string) $row['details']
                );
            }
        );

        Response::ok($envelope);
    }

    /** POST /complaints */
    public static function store(array $params = []): void
    {
        $in   = Router::jsonBody();
        $role = Auth::role() ?? '';

        $againstRole = self::str($in, 'against_role');
        $againstName = self::str($in, 'against_name');
        $category    = self::str($in, 'category');
        $reference   = self::str($in, 'reference');
        $subject     = self::str($in, 'subject');
        $details     = self::str($in, 'details');

        $errors = [];
        $checks = [
            'against_role' => Validator::oneOf($againstRole, self::RULES[$role] ?? [], 'party'),
            'against_name' => Validator::required($againstName, 'Name')
                ?? Validator::maxLength($againstName, self::LIMITS['against_name'], 'Name'),
            'category'     => Validator::oneOf($category, self::CATEGORIES, 'category'),
            'reference'    => Validator::maxLength($reference, self::LIMITS['reference'], 'Reference'),
            'subject'      => Validator::required($subject, 'Subject')
                ?? Validator::maxLength($subject, self::LIMITS['subject'], 'Subject'),
            'details'      => Validator::required($details, 'Details')
                ?? Validator::maxLength($details, self::LIMITS['details'], 'Details'),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $now = date('c');
        $row = [
            'reference'         => 'CP-' . random_int(100, 999),
            'complainant_name'  => 'You',
            'complainant_role'  => $role,
            'against_role'      => $againstRole,
            'against_name'      => $againstName,
            'related_ref'       => $reference,
            'category'          => $category,
            'subject'           => $subject,
            'details'           => $details,
            // An admin sets the priority during triage; a new complaint starts
            // in the middle rather than letting the complainant pick.
            'priority'          => 'medium',
            'status'            => 'submitted',
            'resolution'        => null,
            'submitted_at'      => $now,
            'updated_at'        => $now,
        ];
        FixtureState::push(self::BUCKET, $row);

        Response::ok($row, 201);
    }

    /**
     * This user's complaints, newest first: anything submitted this session,
     * then the fixture rows.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function rows(): array
    {
        $role = Auth::role() ?? '';

        $rows = array_map(static function (array $row) use ($role): array {
            return [
                'reference'        => $row['reference'],
                // Only the admin list shows this, and that still reads the
                // mock; it is carried so the row shape stays complete.
                'complainant_name' => 'You',
                'complainant_role' => $role,
                'against_role'     => $row['against_role'],
                'against_name'     => $row['against_name'],
                'related_ref'      => $row['related_ref'],
                'category'         => $row['category'],
                'subject'          => $row['subject'],
                'details'          => $row['details'],
                'priority'         => $row['priority'],
                'status'           => $row['status'],
                'resolution'       => $row['resolution'],
                // The complaints page parses ISO, unlike the inbox pages.
                'submitted_at'     => Fixtures::iso((int) $row['days_ago']),
                'updated_at'       => Fixtures::iso((int) $row['updated_days_ago']),
            ];
        }, Fixtures::forRole('complaints', $role));

        $rows = array_merge(FixtureState::rows(self::BUCKET), $rows);
        usort($rows, static fn (array $a, array $b): int => strcmp($b['submitted_at'], $a['submitted_at']));
        return $rows;
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
