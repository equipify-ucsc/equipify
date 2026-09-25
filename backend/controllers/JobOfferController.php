<?php
/**
 * The freelance worker's side of jobs: browse the jobs customers have
 * published, bid a fixed total price on one, or decline it.
 *
 * A worker never takes a job directly. They bid, the customer compares the
 * bids and hires one (JobController::hire), and that is what turns an offer
 * into "accepted" here. Declining only hides the job from this worker's open
 * offers (it shows as Declined); the job stays open for everyone else.
 *
 * Responses keep the shapes the Job Offers page was built against, so the
 * page, its pager, search box and filters work unchanged.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../models/JobModel.php';
require_once __DIR__ . '/../models/JobBidModel.php';
require_once __DIR__ . '/../models/JobDeclineModel.php';
require_once __DIR__ . '/JobController.php';

final class JobOfferController
{
    /** How a job looks to one worker (derived in JobModel::offersQuery()). */
    private const OFFER_STATUSES = ['open', 'accepted', 'declined', 'expired'];
    private const BID_STATUSES   = ['submitted', 'shortlisted', 'won', 'lost'];

    private const DISTRICTS = [
        'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
        'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
        'Mannar', 'Matale', 'Matara', 'Moneragala', 'Mullaitivu', 'Nuwara Eliya',
        'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
    ];

    /** "MySQL duplicate key" (uq_job_bids_job_worker). */
    private const SQLSTATE_DUPLICATE = '23000';

    /**
     * GET /freelancer/job-offers?tab=offers|bids&q=&status=&district=&page=&per_page=
     *
     * One endpoint for both tabs of the Job Offers page: "My bids" is the same
     * jobs seen through the bids this worker placed.
     */
    public static function jobOffers(array $params = []): void
    {
        $workerId = (int) Auth::userId();
        $tab      = ListQuery::enum('tab', ['offers', 'bids']) ?: 'offers';
        $page     = ListQuery::page();
        $perPage  = ListQuery::perPage();
        $filters  = [
            'q'        => ListQuery::search(),
            'status'   => ListQuery::enum('status', $tab === 'bids' ? self::BID_STATUSES : self::OFFER_STATUSES),
            'district' => ListQuery::enum('district', self::DISTRICTS),
        ];
        $offset = ($page - 1) * $perPage;

        if ($tab === 'bids') {
            $total = JobBidModel::countForWorker($workerId, $filters);
            $items = array_map(
                [self::class, 'presentBid'],
                JobBidModel::pageForWorker($workerId, $filters, $perPage, $offset)
            );
        } else {
            $total = JobModel::countOffersForWorker($workerId, $filters);
            $items = array_map(
                [self::class, 'presentOffer'],
                JobModel::offersForWorker($workerId, $filters, $perPage, $offset)
            );
        }

        Response::ok(ListQuery::envelope($items, $page, $perPage, $total));
    }

    /** POST /freelancer/job-offers/{id}/decline */
    public static function declineOffer(array $params = []): void
    {
        $workerId = (int) Auth::userId();
        $job      = self::findPublishedOr404($params['id'] ?? null);
        $jobId    = (int) $job['job_id'];

        if ($job['status'] !== 'open') {
            Response::error('This offer is no longer open.', 409);
        }
        if (JobBidModel::existsFor($jobId, $workerId)) {
            Response::error('You have already bid on this job, so it cannot be declined.', 409);
        }

        JobDeclineModel::insert($jobId, $workerId);

        Response::ok([
            'offer_id' => $jobId,
            'job_ref'  => 'JOB-' . $jobId,
            'status'   => 'declined',
        ]);
    }

    /** POST /freelancer/bids  {offer_id, bid_amount_lkr, message} */
    public static function placeBid(array $params = []): void
    {
        $workerId = (int) Auth::userId();
        $in       = Router::jsonBody();
        $offerId  = filter_var($in['offer_id'] ?? null, FILTER_VALIDATE_INT);
        $amount   = $in['bid_amount_lkr'] ?? null;
        $message  = is_string($in['message'] ?? null) ? trim($in['message']) : '';

        $errors = [];
        if ($offerId === false || $offerId < 1) {
            $errors['offer_id'] = 'Select a job offer to bid on.';
        }
        if (!is_numeric($amount)) {
            $errors['bid_amount_lkr'] = 'Enter your price for the whole job.';
        } elseif ($problem = Validator::money($amount, 'Bid amount')) {
            $errors['bid_amount_lkr'] = $problem;
        } elseif ((float) $amount <= 0) {
            $errors['bid_amount_lkr'] = 'Bid amount must be more than zero.';
        }
        if ($problem = Validator::maxLength($message, 1000, 'Message')) {
            $errors['message'] = $problem;
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $job   = self::findPublishedOr404($offerId);
        $jobId = (int) $job['job_id'];

        if ($job['status'] !== 'open' || (int) $job['start_passed'] === 1) {
            Response::error('This job is no longer taking bids.', 409);
        }
        if (JobDeclineModel::exists($jobId, $workerId)) {
            Response::error('You declined this job, so you cannot bid on it.', 409);
        }
        if (JobBidModel::existsFor($jobId, $workerId)) {
            self::alreadyBid();
        }

        try {
            $bidId = JobBidModel::insert(
                $jobId,
                $workerId,
                number_format((float) $amount, 2, '.', ''),
                $message === '' ? null : $message
            );
        } catch (PDOException $e) {
            // Lost a race with a second submit of the same bid.
            if ($e->getCode() === self::SQLSTATE_DUPLICATE) {
                self::alreadyBid();
            }
            throw $e;
        }

        // Read back rather than echo the input, so the amount and timestamp are
        // exactly what was stored.
        $bid = (array) JobBidModel::findForJob($bidId, $jobId);
        Response::ok(self::presentBid($bid + [
            'title'         => $job['title'],
            'customer_name' => $job['customer_name'],
            'equipment'     => $job['equipment'],
            'district'      => $job['district'],
            'budget_lkr'    => $job['budget_lkr'],
        ]), 201);
    }

    // ------------------------------------------------------------- helpers

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentOffer(array $row): array
    {
        return [
            'offer_id'          => (int) $row['job_id'],
            'job_ref'           => 'JOB-' . $row['job_id'],
            'title'             => $row['title'],
            'customer_name'     => $row['customer_name'],
            'equipment'         => $row['equipment'],
            'district'          => $row['district'],
            'site'              => $row['site'],
            'start_date'        => $row['start_date'],
            'end_date'          => $row['end_date'],
            'duration_days'     => JobController::durationDays((string) $row['start_date'], (string) $row['end_date']),
            'budget_lkr'        => (float) $row['budget_lkr'],
            'status'            => $row['offer_status'],
            // Set when this worker has already bid, so the page can say so
            // instead of offering another bid.
            'my_bid_amount_lkr' => $row['my_bid_amount_lkr'] === null ? null : (float) $row['my_bid_amount_lkr'],
            'posted_at'         => $row['published_at'],
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function presentBid(array $row): array
    {
        return [
            'bid_id'         => (int) $row['bid_id'],
            'offer_id'       => (int) $row['job_id'],
            'job_ref'        => 'JOB-' . $row['job_id'],
            'title'          => $row['title'],
            'customer_name'  => $row['customer_name'],
            'equipment'      => $row['equipment'],
            'district'       => $row['district'],
            'budget_lkr'     => (float) $row['budget_lkr'],
            'bid_amount_lkr' => (float) $row['bid_amount_lkr'],
            'message'        => $row['message'],
            'status'         => $row['status'],
            'submitted_at'   => $row['submitted_at'],
        ];
    }

    /**
     * A published job for an id from the URL or body, or a 404. Drafts are
     * invisible to workers, so they read as not found.
     *
     * @param mixed $id
     * @return array<string,mixed>
     */
    private static function findPublishedOr404($id): array
    {
        $id  = filter_var($id, FILTER_VALIDATE_INT);
        $row = ($id === false || $id < 1) ? null : JobModel::findPublished($id);
        if ($row === null) {
            Response::error('That job offer no longer exists.', 404);
        }
        return $row;
    }

    private static function alreadyBid(): void
    {
        Response::error('You have already bid on this job.', 409);
    }
}
