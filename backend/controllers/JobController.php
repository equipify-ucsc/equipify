<?php
/**
 * A customer's job offers for freelance workers: post, list, edit, publish,
 * remove, compare bids, hire and mark done.
 *
 * Every job is fixed-price: budget_lkr is the total the customer will pay,
 * and workers bid a total too.
 *
 * Lifecycle: draft -> open -> hired -> completed, or open -> cancelled.
 * - A draft is only visible to its customer and can be edited or deleted.
 * - An open job can still be edited until the first bid arrives; after that
 *   its terms are fixed, because workers have priced them.
 * - "Delete" on an open job cancels it instead, so it stays in history and
 *   its bidders see it end. Hired and completed jobs can't be removed.
 *
 * Each customer only ever sees or touches the jobs they posted.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/JobModel.php';
require_once __DIR__ . '/../models/JobBidModel.php';
require_once __DIR__ . '/../services/JobHiringService.php';

final class JobController
{
    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    /** GET /customer/jobs */
    public static function index(array $params = []): void
    {
        Response::ok(array_map(
            [self::class, 'present'],
            JobModel::allForCustomer((int) Auth::userId())
        ));
    }

    /** GET /customer/jobs/{id} */
    public static function show(array $params = []): void
    {
        Response::ok(self::present(self::findOr404($params)));
    }

    /**
     * POST /customer/jobs
     *
     * `publish: true` in the body posts the job straight away; otherwise it is
     * saved as a draft.
     */
    public static function store(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $in         = Router::jsonBody();
        $job        = self::readJob($in);

        $jobId = JobModel::insert($customerId, $job, ($in['publish'] ?? false) === true);

        Response::ok(self::present((array) JobModel::findForCustomer($jobId, $customerId)), 201);
    }

    /** PUT /customer/jobs/{id} */
    public static function update(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $current    = self::findOr404($params);
        $jobId      = (int) $current['job_id'];

        self::requireEditable($current);
        // The UPDATE repeats the editable condition, so a bid landing between
        // this check and the write leaves the job as the bidder saw it.
        JobModel::update($jobId, $customerId, self::readJob(Router::jsonBody()));

        Response::ok(self::present((array) JobModel::findForCustomer($jobId, $customerId)));
    }

    /**
     * DELETE /customer/jobs/{id}
     *
     * A draft is deleted outright. An open job is cancelled instead (its bids
     * lose), so the job and the bids placed on it stay on record. The response
     * says which of the two happened.
     */
    public static function destroy(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $current    = self::findOr404($params);
        $jobId      = (int) $current['job_id'];

        if ($current['status'] === 'draft' && JobModel::deleteDraft($jobId, $customerId)) {
            Response::ok(['job_id' => $jobId, 'outcome' => 'deleted']);
        }
        if ($current['status'] === 'open' && JobHiringService::cancel($jobId, $customerId)) {
            Response::ok(['job_id' => $jobId, 'outcome' => 'cancelled']);
        }

        Response::error(self::statusConflict($current['status'], 'removed'), 409);
    }

    /** POST /customer/jobs/{id}/publish */
    public static function publish(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $current    = self::findOr404($params);
        $jobId      = (int) $current['job_id'];

        if ($current['status'] !== 'draft') {
            Response::error('Only a draft can be published.', 409);
        }
        if (Validator::futureDate((string) $current['start_date'], 'Start date') !== null) {
            Response::error('Please fix the highlighted fields.', 422, [
                'start_date' => 'The start date has passed. Edit the job and pick new dates before publishing.',
            ]);
        }
        if (!JobModel::publish($jobId, $customerId)) {
            Response::error('Only a draft can be published.', 409);
        }

        Response::ok(self::present((array) JobModel::findForCustomer($jobId, $customerId)));
    }

    /** GET /customer/jobs/{id}/bids */
    public static function bids(array $params = []): void
    {
        $job = self::findOr404($params);
        Response::ok(array_map([self::class, 'presentBid'], JobBidModel::allForJob((int) $job['job_id'])));
    }

    /** POST /customer/jobs/{id}/hire  {bid_id} */
    public static function hire(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $current    = self::findOr404($params);
        $jobId      = (int) $current['job_id'];

        if ($current['status'] !== 'open') {
            Response::error('You can only hire for a job that is open.', 409);
        }

        $bidId = filter_var(Router::jsonBody()['bid_id'] ?? null, FILTER_VALIDATE_INT);
        $bid   = ($bidId === false || $bidId < 1) ? null : JobBidModel::findForJob($bidId, $jobId);
        if ($bid === null) {
            Response::error('That bid was not found on this job.', 404);
        }
        if (!in_array($bid['status'], ['submitted', 'shortlisted'], true)
            || !JobHiringService::hire($jobId, $customerId, $bid)) {
            Response::error('This job or bid has already been decided. Refresh to see the latest.', 409);
        }

        Response::ok(self::present((array) JobModel::findForCustomer($jobId, $customerId)));
    }

    /** POST /customer/jobs/{id}/complete */
    public static function complete(array $params = []): void
    {
        $customerId = (int) Auth::userId();
        $current    = self::findOr404($params);
        $jobId      = (int) $current['job_id'];

        if ($current['status'] !== 'hired' || !JobModel::complete($jobId, $customerId)) {
            Response::error('Only a job with a hired worker can be marked completed.', 409);
        }

        Response::ok(self::present((array) JobModel::findForCustomer($jobId, $customerId)));
    }

    // ------------------------------------------------------------- helpers

    /**
     * Validates the job fields shared by create and update, ending the request
     * with 422 and a per-field map when anything is wrong.
     *
     * @return array{title:string,equipment:string,description:?string,district:string,
     *               site:string,start_date:string,end_date:string,budget_lkr:string}
     */
    private static function readJob(array $in): array
    {
        $title       = self::str($in, 'title');
        $equipment   = self::str($in, 'equipment');
        $description = self::str($in, 'description');
        $district    = self::str($in, 'district');
        $site        = self::str($in, 'site');
        $startDate   = self::str($in, 'start_date');
        $endDate     = self::str($in, 'end_date');
        $budget      = self::num($in, 'budget_lkr');

        $errors = [];
        $checks = [
            'title'       => Validator::required($title, 'Job title') ?? Validator::maxLength($title, 150, 'Job title'),
            'equipment'   => Validator::required($equipment, 'Equipment') ?? Validator::maxLength($equipment, 100, 'Equipment'),
            'description' => Validator::maxLength($description, 2000, 'Description'),
            'district'    => Validator::oneOf($district, self::DISTRICTS, 'district'),
            'site'        => Validator::required($site, 'Site') ?? Validator::maxLength($site, 150, 'Site'),
            'start_date'  => Validator::futureDate($startDate, 'Start date'),
            'end_date'    => Validator::date($endDate, 'End date'),
            'budget_lkr'  => Validator::required($budget, 'Fixed price') ?? Validator::money($budget, 'Fixed price'),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if (!isset($errors['start_date']) && !isset($errors['end_date']) && $endDate < $startDate) {
            $errors['end_date'] = 'End date cannot be before the start date.';
        }
        if (!isset($errors['budget_lkr']) && (float) $budget <= 0) {
            $errors['budget_lkr'] = 'Fixed price must be more than zero.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        return [
            'title'       => $title,
            'equipment'   => $equipment,
            'description' => $description === '' ? null : $description,
            'district'    => $district,
            'site'        => $site,
            'start_date'  => $startDate,
            'end_date'    => $endDate,
            'budget_lkr'  => number_format((float) $budget, 2, '.', ''),
        ];
    }

    /** Ends the request with 409 unless the job's terms may still change. */
    private static function requireEditable(array $job): void
    {
        if (self::canEdit($job)) {
            return;
        }
        if ($job['status'] === 'open') {
            Response::error('Workers have already bid on this job, so its details can no longer be changed.', 409);
        }
        Response::error(self::statusConflict($job['status'], 'edited'), 409);
    }

    /** A draft, or an open job nobody has bid on yet. */
    private static function canEdit(array $job): bool
    {
        return $job['status'] === 'draft'
            || ($job['status'] === 'open' && (int) $job['bid_count'] === 0);
    }

    private static function statusConflict(string $status, string $action): string
    {
        return 'A ' . $status . ' job cannot be ' . $action . '.';
    }

    /**
     * Shapes a job row for the page. DECIMAL columns come back from PDO as
     * strings, so the numbers are cast here. The action flags are the
     * server's decision, so the page doesn't re-derive the rules.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function present(array $row): array
    {
        $bidCount = (int) $row['bid_count'];
        return [
            'job_id'            => (int) $row['job_id'],
            'job_ref'           => 'JOB-' . $row['job_id'],
            'title'             => $row['title'],
            'equipment'         => $row['equipment'],
            'description'       => $row['description'],
            'district'          => $row['district'],
            'site'              => $row['site'],
            'start_date'        => $row['start_date'],
            'end_date'          => $row['end_date'],
            'duration_days'     => self::durationDays((string) $row['start_date'], (string) $row['end_date']),
            'budget_lkr'        => (float) $row['budget_lkr'],
            'status'            => $row['status'],
            'bid_count'         => $bidCount,
            'hired_worker_name' => $row['hired_worker_name'],
            'can_edit'          => self::canEdit($row),
            'published_at'      => $row['published_at'],
            'hired_at'          => $row['hired_at'],
            'completed_at'      => $row['completed_at'],
            'cancelled_at'      => $row['cancelled_at'],
            'created_at'        => $row['created_at'],
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentBid(array $row): array
    {
        return [
            'bid_id'              => (int) $row['bid_id'],
            'worker_name'         => $row['worker_name'],
            'worker_district'     => $row['worker_district'],
            'years_experience'    => $row['years_experience'] === null ? null : (int) $row['years_experience'],
            'avg_rating'          => (float) $row['avg_rating'],
            'rating_count'        => (int) $row['rating_count'],
            'verified'            => $row['verification_status'] === 'verified',
            'bid_amount_lkr'      => (float) $row['bid_amount_lkr'],
            'message'             => $row['message'],
            'status'              => $row['status'],
            'submitted_at'        => $row['submitted_at'],
        ];
    }

    /** Calendar days the job spans, counting both ends (a one-day job is 1). */
    public static function durationDays(string $start, string $end): int
    {
        return (int) (new DateTimeImmutable($start))->diff(new DateTimeImmutable($end))->days + 1;
    }

    /**
     * This customer's job for the {id} path segment, or a 404. Another
     * customer's job is indistinguishable from one that doesn't exist.
     *
     * @return array<string,mixed>
     */
    private static function findOr404(array $params): array
    {
        $id  = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1)
            ? null
            : JobModel::findForCustomer($id, (int) Auth::userId());
        if ($row === null) {
            Response::error('Job not found.', 404);
        }
        return $row;
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }

    /** A number sent either as a JSON number or a numeric string, as a trimmed string. */
    private static function num(array $in, string $key): string
    {
        $value = $in[$key] ?? null;
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        return is_string($value) ? trim($value) : '';
    }
}
