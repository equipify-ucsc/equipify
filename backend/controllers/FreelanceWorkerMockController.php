<?php
/**
 * Placeholder data for the parts of the freelance-worker portal whose tables
 * the schema does not have yet (jobs, bids, payments, messages, notifications,
 * complaints).
 *
 * These endpoints are deliberately shaped exactly like the real ones: same
 * {success, data} envelope, same {items, page, per_page, total, total_pages}
 * list envelope, and the same search / filter / pagination semantics applied
 * here on the server rather than in the browser. When the migrations for these
 * tables land, only the bodies below change. The pages, their pagers, search
 * boxes and filters keep working untouched.
 *
 * The rows are generated from a fixed seed so every request returns the same
 * data; nothing is persisted, so the write endpoints validate their input and
 * echo the result back instead of storing it.
 */

declare(strict_types=1);

require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../models/FreelanceWorkerModel.php';

final class FreelanceWorkerMockController
{
    /** The "today" every generated date is measured from, so output is stable. */
    private const ANCHOR = '2026-09-22';

    private const OFFER_STATUSES    = ['open', 'accepted', 'declined', 'expired'];
    private const BID_STATUSES      = ['submitted', 'shortlisted', 'won', 'lost'];
    private const JOB_STATUSES      = ['in_progress', 'completed', 'cancelled'];
    private const PAYMENT_STATUSES  = ['paid', 'pending', 'failed'];
    private const NOTIFICATION_TYPES = ['job', 'bid', 'payment'];
    private const COMPLAINT_STATUSES = ['submitted', 'under_review', 'resolved', 'dismissed'];

    private const DISTRICTS = [
        'Colombo', 'Gampaha', 'Kandy', 'Galle', 'Kurunegala', 'Matara', 'Jaffna', 'Ratnapura',
    ];

    private const EQUIPMENT = [
        'Excavator (20t)', 'Mobile Crane', 'Concrete Mixer', 'Backhoe Loader', 'Bulldozer',
        'Scissor Lift', 'Road Roller', 'Skid Steer Loader', 'Tower Crane', 'Forklift (3t)',
    ];

    private const CUSTOMERS = [
        'Lanka Build (Pvt) Ltd', 'Ceylon Infra Group', 'Hemas Constructions', 'Access Engineering',
        'Sanken Builders', 'Maga Engineering', 'Tudawe Brothers', 'ICC Holdings',
        'Nawaloka Construction', 'KDA Weerasinghe',
    ];

    private const SITES = [
        'Port City Phase 2', 'Kandy Ring Road', 'Galle Harbour Yard', 'Katunayake Expressway',
        'Colombo Metro Depot', 'Hambantota Industrial Zone', 'Negombo Water Project',
    ];

    // ---------------------------------------------------------------- dashboard

    /** GET /freelancer/dashboard */
    public static function dashboard(array $params = []): void
    {
        $openOffers  = array_values(array_filter(self::offers(), static fn ($o) => $o['status'] === 'open'));
        $activeJobs  = array_values(array_filter(self::jobRows(), static fn ($j) => $j['status'] === 'in_progress'));
        $pendingBids = array_values(array_filter(self::bids(), static fn ($b) => in_array($b['status'], ['submitted', 'shortlisted'], true)));

        $monthEarnings = 0.0;
        foreach (self::paymentRows() as $payment) {
            if ($payment['status'] === 'paid' && strpos($payment['paid_at'], substr(self::ANCHOR, 0, 7)) === 0) {
                $monthEarnings += $payment['amount_lkr'];
            }
        }

        Response::ok([
            'stats' => [
                'open_offers'    => count($openOffers),
                'active_jobs'    => count($activeJobs),
                'pending_bids'   => count($pendingBids),
                'month_earnings' => round($monthEarnings, 2),
                'unread_notifications' => count(array_filter(self::notificationRows(), static fn ($n) => !$n['is_read'])),
            ],
            // Twelve weeks of earnings for the CSS bar chart; `height_pct` keeps
            // the bar sizing out of the page script.
            'earnings_chart' => self::earningsChart(),
            'recent_offers'  => array_slice($openOffers, 0, 4),
            'recent_activity' => array_slice(self::activity(), 0, 6),
        ]);
    }

    // ------------------------------------------------------------- job offers

    /**
     * GET /freelancer/job-offers?tab=offers|bids&q=&status=&district=&page=&per_page=
     *
     * One endpoint for both tabs of the Job Offers page: the "My bids" tab is
     * the same list joined the other way round, which is how the real query
     * will work too.
     */
    public static function jobOffers(array $params = []): void
    {
        $tab      = ListQuery::enum('tab', ['offers', 'bids']) ?: 'offers';
        $term     = ListQuery::search();
        $district = ListQuery::enum('district', self::DISTRICTS);
        $page     = ListQuery::page();
        $perPage  = ListQuery::perPage();

        if ($tab === 'bids') {
            $status = ListQuery::enum('status', self::BID_STATUSES);
            $rows   = self::bids();
        } else {
            $status = ListQuery::enum('status', self::OFFER_STATUSES);
            $rows   = self::offers();
        }

        Response::ok(ListQuery::paginate(
            $rows,
            $page,
            $perPage,
            static function (array $row) use ($term, $status, $district): bool {
                return ListQuery::contains($term, $row['title'], $row['customer_name'], $row['equipment'], $row['job_ref'])
                    && ($status === '' || $row['status'] === $status)
                    && ($district === '' || $row['district'] === $district);
            }
        ));
    }

    /**
     * POST /freelancer/job-offers/{id}/decline
     *
     * The only decision an operator makes on an open offer. There is no accept:
     * the way onto a job is a bid, and the customer picks the winner, so
     * 'accepted' is a status an offer arrives in, never one this endpoint sets.
     */
    public static function declineOffer(array $params = []): void
    {
        $offer = self::findById(self::offers(), 'offer_id', (int) ($params['id'] ?? 0));
        if ($offer === null) {
            Response::error('That job offer no longer exists.', 404);
        }
        if ($offer['status'] !== 'open') {
            Response::error('This offer is no longer open.', 409);
        }
        Response::ok([
            'offer_id' => $offer['offer_id'],
            'job_ref'  => $offer['job_ref'],
            'status'   => 'declined',
        ]);
    }

    /**
     * POST /freelancer/bids: validates a bid the way the real endpoint will,
     * then returns the bid that would have been stored.
     */
    public static function placeBid(array $params = []): void
    {
        $in      = Router::jsonBody();
        $offerId = filter_var($in['offer_id'] ?? null, FILTER_VALIDATE_INT);
        $amount  = $in['bid_amount_lkr'] ?? null;
        $message = is_string($in['message'] ?? null) ? trim($in['message']) : '';

        $errors = [];
        if ($offerId === false || $offerId < 1) {
            $errors['offer_id'] = 'Select a job offer to bid on.';
        }
        if (!is_numeric($amount)) {
            $errors['bid_amount_lkr'] = 'Enter your bid amount.';
        } elseif ($problem = Validator::money($amount, 'Bid amount')) {
            $errors['bid_amount_lkr'] = $problem;
        } elseif ((float) $amount <= 0) {
            $errors['bid_amount_lkr'] = 'Bid amount must be more than zero.';
        }
        if ($problem = Validator::maxLength($message, 1000, 'Message')) {
            $errors['message'] = $problem;
        }

        $offer = self::findById(self::offers(), 'offer_id', (int) $offerId);
        if ($errors === [] && $offer === null) {
            Response::error('That job offer no longer exists.', 404);
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        Response::ok([
            'bid_id'         => 0,
            'offer_id'       => (int) $offerId,
            'job_ref'        => $offer['job_ref'],
            'title'          => $offer['title'],
            'bid_amount_lkr' => round((float) $amount, 2),
            'message'        => $message,
            'status'         => 'submitted',
            'submitted_at'   => self::ANCHOR,
        ], 201);
    }

    // ------------------------------------------------------------ job history

    /** GET /freelancer/jobs?q=&status=&from=&to=&page=&per_page= */
    public static function jobs(array $params = []): void
    {
        $term    = ListQuery::search();
        $status  = ListQuery::enum('status', self::JOB_STATUSES);
        $from    = ListQuery::date('from');
        $to      = ListQuery::date('to');
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage();

        Response::ok(ListQuery::paginate(
            self::jobRows(),
            $page,
            $perPage,
            static function (array $row) use ($term, $status, $from, $to): bool {
                return ListQuery::contains($term, $row['title'], $row['customer_name'], $row['equipment'], $row['job_ref'])
                    && ($status === '' || $row['status'] === $status)
                    && ($from === '' || $row['end_date'] >= $from)
                    && ($to === '' || $row['start_date'] <= $to);
            }
        ));
    }

    /**
     * POST /freelancer/jobs/{id}/rating: a worker rating the customer they
     * worked for (the other half of customers.freelancer_avg_rating).
     */
    public static function rateCustomer(array $params = []): void
    {
        $in     = Router::jsonBody();
        $jobId  = (int) ($params['id'] ?? 0);
        $rating = filter_var($in['rating'] ?? null, FILTER_VALIDATE_INT);
        $note   = is_string($in['comment'] ?? null) ? trim($in['comment']) : '';

        $job = self::findById(self::jobRows(), 'job_id', $jobId);
        if ($job === null) {
            Response::error('That job no longer exists.', 404);
        }

        $errors = [];
        if ($rating === false || $rating < 1 || $rating > 5) {
            $errors['rating'] = 'Choose a rating from 1 to 5 stars.';
        }
        if ($message = Validator::maxLength($note, 1000, 'Comment')) {
            $errors['comment'] = $message;
        }
        if ($job['status'] !== 'completed') {
            $errors['rating'] = 'You can only rate a customer after the job is completed.';
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        Response::ok(['job_id' => $jobId, 'customer_rating_given' => $rating, 'comment' => $note], 201);
    }

    // --------------------------------------------------------------- payments

    /** GET /freelancer/payments?q=&status=&from=&to=&page=&per_page= */
    public static function payments(array $params = []): void
    {
        $term    = ListQuery::search();
        $status  = ListQuery::enum('status', self::PAYMENT_STATUSES);
        $from    = ListQuery::date('from');
        $to      = ListQuery::date('to');
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage();

        $rows = self::paymentRows();
        $envelope = ListQuery::paginate(
            $rows,
            $page,
            $perPage,
            static function (array $row) use ($term, $status, $from, $to): bool {
                return ListQuery::contains($term, $row['description'], $row['job_ref'], $row['reference'])
                    && ($status === '' || $row['status'] === $status)
                    && ($from === '' || $row['paid_at'] >= $from)
                    && ($to === '' || $row['paid_at'] <= $to);
            }
        );

        // Summary tiles reflect the whole account, not the current page.
        $envelope['summary'] = [
            'paid_total'    => round(self::sumWhere($rows, 'paid'), 2),
            'pending_total' => round(self::sumWhere($rows, 'pending'), 2),
            'failed_count'  => count(array_filter($rows, static fn ($p) => $p['status'] === 'failed')),
        ];

        Response::ok($envelope);
    }

    /** GET /freelancer/invoices/{id} */
    public static function invoice(array $params = []): void
    {
        $payment = self::findById(self::paymentRows(), 'payment_id', (int) ($params['id'] ?? 0));
        if ($payment === null) {
            Response::error('Invoice not found.', 404);
        }

        $subtotal = $payment['amount_lkr'];
        $fee      = round($subtotal * 0.08, 2); // 8% platform fee

        Response::ok([
            'invoice_id'   => $payment['payment_id'],
            'number'       => 'INV-' . str_pad((string) $payment['payment_id'], 5, '0', STR_PAD_LEFT),
            'job_ref'      => $payment['job_ref'],
            'description'  => $payment['description'],
            'issued_on'    => $payment['paid_at'],
            'subtotal_lkr' => round($subtotal, 2),
            'platform_fee_lkr' => $fee,
            'net_lkr'      => round($subtotal - $fee, 2),
            'status'       => $payment['status'],
        ]);
    }

    // --------------------------------------------------------------- messages

    /** GET /freelancer/conversations?q=&page=&per_page= */
    public static function conversations(array $params = []): void
    {
        $term = ListQuery::search();
        Response::ok(ListQuery::paginate(
            self::conversationRows(),
            ListQuery::page(),
            ListQuery::perPage(8),
            static fn (array $row): bool => ListQuery::contains($term, $row['party_name'], $row['job_ref'], $row['last_message'])
        ));
    }

    /** GET /freelancer/messages?conversation_id=&page=&per_page= */
    public static function messages(array $params = []): void
    {
        $conversationId = filter_var($_GET['conversation_id'] ?? null, FILTER_VALIDATE_INT);
        if ($conversationId === false || self::findById(self::conversationRows(), 'conversation_id', $conversationId) === null) {
            Response::error('Conversation not found.', 404);
        }

        // Newest page first so "Load earlier" can walk backwards; the page
        // reverses each batch before appending.
        Response::ok(ListQuery::paginate(
            self::messageRows($conversationId),
            ListQuery::page(),
            ListQuery::perPage(12),
            null
        ));
    }

    /** POST /freelancer/messages */
    public static function sendMessage(array $params = []): void
    {
        $in             = Router::jsonBody();
        $conversationId = filter_var($in['conversation_id'] ?? null, FILTER_VALIDATE_INT);
        $body           = is_string($in['body'] ?? null) ? trim($in['body']) : '';

        $errors = [];
        if ($conversationId === false || self::findById(self::conversationRows(), 'conversation_id', $conversationId) === null) {
            $errors['conversation_id'] = 'Pick a conversation first.';
        }
        if ($message = Validator::required($body, 'Message') ?? Validator::maxLength($body, 2000, 'Message')) {
            $errors['body'] = $message;
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        Response::ok([
            'message_id'      => 0,
            'conversation_id' => (int) $conversationId,
            'sender'          => 'me',
            'body'            => $body,
            'sent_at'         => self::ANCHOR . ' 09:00',
        ], 201);
    }

    // ---------------------------------------------------------- notifications

    /** GET /freelancer/notifications?type=&unread=1&page=&per_page= */
    public static function notifications(array $params = []): void
    {
        $type   = ListQuery::enum('type', self::NOTIFICATION_TYPES);
        $unread = ListQuery::flag('unread');

        Response::ok(ListQuery::paginate(
            self::notificationRows(),
            ListQuery::page(),
            ListQuery::perPage(),
            static function (array $row) use ($type, $unread): bool {
                return ($type === '' || $row['type'] === $type)
                    && (!$unread || !$row['is_read']);
            }
        ));
    }

    /** POST /freelancer/notifications/read: one id, or every notification. */
    public static function markNotificationsRead(array $params = []): void
    {
        $in = Router::jsonBody();
        if (($in['all'] ?? false) === true) {
            Response::ok(['marked' => count(self::notificationRows())]);
        }

        $id = filter_var($in['notification_id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || self::findById(self::notificationRows(), 'notification_id', $id) === null) {
            Response::error('Notification not found.', 404);
        }
        Response::ok(['marked' => 1, 'notification_id' => $id]);
    }

    // ------------------------------------------------------------- complaints

    /** GET /freelancer/complaints?q=&status=&page=&per_page= */
    public static function complaints(array $params = []): void
    {
        $term   = ListQuery::search();
        $status = ListQuery::enum('status', self::COMPLAINT_STATUSES);

        Response::ok(ListQuery::paginate(
            self::complaintRows(),
            ListQuery::page(),
            ListQuery::perPage(),
            static function (array $row) use ($term, $status): bool {
                return ListQuery::contains($term, $row['subject'], $row['against_name'], $row['reference'], $row['job_ref'])
                    && ($status === '' || $row['status'] === $status);
            }
        ));
    }

    /** POST /freelancer/complaints */
    public static function submitComplaint(array $params = []): void
    {
        $in      = Router::jsonBody();
        $against = is_string($in['against_name'] ?? null) ? trim($in['against_name']) : '';
        $jobRef  = is_string($in['job_ref'] ?? null) ? trim($in['job_ref']) : '';
        $subject = is_string($in['subject'] ?? null) ? trim($in['subject']) : '';
        $details = is_string($in['details'] ?? null) ? trim($in['details']) : '';

        $errors = [];
        $checks = [
            'against_name' => Validator::required($against, 'Customer name') ?? Validator::maxLength($against, 150, 'Customer name'),
            'job_ref'      => Validator::maxLength($jobRef, 30, 'Job reference'),
            'subject'      => Validator::required($subject, 'Subject') ?? Validator::maxLength($subject, 150, 'Subject'),
            'details'      => Validator::required($details, 'Details') ?? Validator::maxLength($details, 2000, 'Details'),
        ];
        foreach ($checks as $field => $message) {
            if ($message !== null) {
                $errors[$field] = $message;
            }
        }
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        Response::ok([
            'complaint_id' => 0,
            'reference'    => 'CMP-NEW',
            'against_name' => $against,
            'job_ref'      => $jobRef,
            'subject'      => $subject,
            'details'      => $details,
            'status'       => 'submitted',
            'submitted_at' => self::ANCHOR,
        ], 201);
    }

    // ==================================================== generated mock rows

    /** @return array<int,array<string,mixed>> 32 job offers */
    private static function offers(): array
    {
        $rows = [];
        for ($i = 1; $i <= 32; $i++) {
            $equipment = self::EQUIPMENT[$i % count(self::EQUIPMENT)];
            $days      = 2 + ($i % 9);
            $rows[] = [
                'offer_id'      => $i,
                'job_ref'       => self::ref('JOB', 4200 + $i),
                'title'         => $equipment . ' operator at ' . self::SITES[$i % count(self::SITES)],
                'customer_name' => self::CUSTOMERS[$i % count(self::CUSTOMERS)],
                'equipment'     => $equipment,
                'district'      => self::DISTRICTS[$i % count(self::DISTRICTS)],
                'site'          => self::SITES[$i % count(self::SITES)],
                'start_date'    => self::day(3 + $i),
                'end_date'      => self::day(3 + $i + $days),
                'duration_days' => $days,
                'budget_lkr'    => 18000.0 + ($i % 7) * 6500,
                // Most offers are open; the rest show the other states the badge handles.
                'status'        => $i % 5 === 0 ? self::OFFER_STATUSES[($i / 5) % 4] : 'open',
                'posted_at'     => self::day(-($i % 12)),
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 24 bids the worker has placed */
    private static function bids(): array
    {
        $rows = [];
        $offers = self::offers();
        for ($i = 1; $i <= 24; $i++) {
            $offer = $offers[($i * 3) % count($offers)];
            $rows[] = [
                'bid_id'         => $i,
                'offer_id'       => $offer['offer_id'],
                'job_ref'        => $offer['job_ref'],
                'title'          => $offer['title'],
                'customer_name'  => $offer['customer_name'],
                'equipment'      => $offer['equipment'],
                'district'       => $offer['district'],
                'bid_amount_lkr' => $offer['budget_lkr'] - 1500 + ($i % 5) * 900,
                'message'        => 'Available from ' . $offer['start_date'] . '. ' . (6 + $i % 9) . ' years on similar sites.',
                'status'         => self::BID_STATUSES[$i % 4],
                'submitted_at'   => self::day(-($i % 15)),
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 36 past and current jobs */
    private static function jobRows(): array
    {
        $rows = [];
        for ($i = 1; $i <= 36; $i++) {
            $equipment = self::EQUIPMENT[($i + 3) % count(self::EQUIPMENT)];
            $length    = 2 + ($i % 8);
            // Roughly one job every three days going back ~4 months, so the
            // current month has a few payouts for the dashboard tile.
            $start     = -($i * 3);
            // The three most recent jobs are still running; older ones are closed.
            $status    = $i <= 3 ? 'in_progress' : ($i % 11 === 0 ? 'cancelled' : 'completed');
            $rows[] = [
                'job_id'        => $i,
                'job_ref'       => self::ref('JOB', 3100 + $i),
                'title'         => $equipment . ' operation at ' . self::SITES[($i + 2) % count(self::SITES)],
                'customer_name' => self::CUSTOMERS[($i + 4) % count(self::CUSTOMERS)],
                'equipment'     => $equipment,
                'district'      => self::DISTRICTS[($i + 1) % count(self::DISTRICTS)],
                'start_date'    => self::day($start),
                'end_date'      => self::day($start + $length),
                'duration_days' => $length,
                'status'        => $status,
                'earnings_lkr'  => $status === 'cancelled' ? 0.0 : 16000.0 + ($i % 9) * 5400,
                // Older completed jobs have already been rated; recent ones haven't.
                'customer_rating_given' => ($status === 'completed' && $i > 8) ? 3 + ($i % 3) : null,
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 30 payouts */
    private static function paymentRows(): array
    {
        $rows = [];
        $jobs = array_values(array_filter(self::jobRows(), static fn ($j) => $j['status'] === 'completed'));
        foreach ($jobs as $index => $job) {
            $i = $index + 1;
            if ($i > 30) {
                break;
            }
            $status = $i <= 2 ? 'pending' : ($i % 13 === 0 ? 'failed' : 'paid');
            $rows[] = [
                'payment_id'  => $i,
                'reference'   => self::ref('PAY', 7700 + $i),
                'job_ref'     => $job['job_ref'],
                'description' => $job['title'],
                'amount_lkr'  => $job['earnings_lkr'],
                'method'      => $i % 3 === 0 ? 'Bank transfer' : 'Card payout',
                'status'      => $status,
                'paid_at'     => $job['end_date'],
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 12 conversations */
    private static function conversationRows(): array
    {
        $rows = [];
        for ($i = 1; $i <= 12; $i++) {
            $rows[] = [
                'conversation_id' => $i,
                'party_name'      => self::CUSTOMERS[$i % count(self::CUSTOMERS)],
                'party_role'      => $i % 4 === 0 ? 'Renting party' : 'Customer',
                'job_ref'         => self::ref('JOB', 3100 + $i),
                'last_message'    => self::MESSAGE_SAMPLES[$i % count(self::MESSAGE_SAMPLES)],
                'last_message_at' => self::day(-($i - 1)) . ' 14:0' . ($i % 10),
                'unread_count'    => $i % 3 === 0 ? ($i % 4) : 0,
            ];
        }
        return $rows;
    }

    private const MESSAGE_SAMPLES = [
        'Site access opens at 6.30 am, please check in at gate B.',
        'Can you extend by two days? Same rate.',
        'Payment has been released to your account.',
        'The operator certificate you sent has been received.',
        'Please confirm the machine hours for yesterday.',
        'Weather delay, so we restart Thursday morning.',
    ];

    /** @return array<int,array<string,mixed>> 26 messages in one thread, newest first */
    private static function messageRows(int $conversationId): array
    {
        $rows = [];
        for ($i = 26; $i >= 1; $i--) {
            $rows[] = [
                'message_id'      => $conversationId * 100 + $i,
                'conversation_id' => $conversationId,
                'sender'          => $i % 2 === 0 ? 'them' : 'me',
                'body'            => self::MESSAGE_SAMPLES[($conversationId + $i) % count(self::MESSAGE_SAMPLES)],
                'sent_at'         => self::day(-(int) floor($i / 2)) . ' ' . str_pad((string) (8 + $i % 9), 2, '0', STR_PAD_LEFT) . ':15',
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 28 notifications */
    private static function notificationRows(): array
    {
        $titles = [
            'job'     => ['New job offer near you', 'Job starts tomorrow', 'Job marked complete'],
            'bid'     => ['Your bid was shortlisted', 'Your bid was accepted', 'Bidding closed on a job'],
            'payment' => ['Payment released', 'Payout on the way', 'Invoice available'],
        ];

        $rows = [];
        for ($i = 1; $i <= 28; $i++) {
            $type = self::NOTIFICATION_TYPES[$i % 3];
            $rows[] = [
                'notification_id' => $i,
                'type'            => $type,
                'title'           => $titles[$type][$i % 3],
                'body'            => self::ref('JOB', 3100 + $i) . ' · ' . self::CUSTOMERS[$i % count(self::CUSTOMERS)]
                    . ' · ' . self::DISTRICTS[$i % count(self::DISTRICTS)],
                'created_at'      => self::day(-($i - 1)) . ' 0' . ($i % 9) . ':30',
                // The newest handful are unread.
                'is_read'         => $i > 6,
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 14 complaints */
    private static function complaintRows(): array
    {
        $subjects = [
            'Site access denied on arrival',
            'Agreed hours not honoured',
            'Unsafe working conditions on site',
            'Payment delayed beyond agreed terms',
            'Equipment handed over damaged',
        ];

        $rows = [];
        for ($i = 1; $i <= 14; $i++) {
            $status = self::COMPLAINT_STATUSES[$i % 4];
            $rows[] = [
                'complaint_id' => $i,
                'reference'    => self::ref('CMP', 900 + $i),
                'against_name' => self::CUSTOMERS[$i % count(self::CUSTOMERS)],
                'job_ref'      => self::ref('JOB', 3100 + $i),
                'subject'      => $subjects[$i % count($subjects)],
                'details'      => 'Reported by the operator after the shift on ' . self::day(-($i * 4)) . '.',
                'status'       => $status,
                'submitted_at' => self::day(-($i * 4)),
                'updated_at'   => self::day(-($i * 4) + 2),
                'resolution'   => in_array($status, ['resolved', 'dismissed'], true)
                    ? 'Reviewed by the admin team; the customer has been contacted.'
                    : null,
            ];
        }
        return $rows;
    }

    /** @return array<int,array<string,mixed>> 12 weeks of earnings for the chart */
    private static function earningsChart(): array
    {
        $weeks = [];
        $values = [];
        for ($i = 11; $i >= 0; $i--) {
            $amount = 24000 + (($i * 7919) % 46000); // stable pseudo-variation
            $values[] = $amount;
            $weeks[] = ['label' => 'W' . (12 - $i), 'amount_lkr' => (float) $amount];
        }
        $max = max($values);
        foreach ($weeks as $index => $week) {
            $weeks[$index]['height_pct'] = (int) round($week['amount_lkr'] / $max * 100);
        }
        return $weeks;
    }

    /** @return array<int,array<string,mixed>> recent activity feed for the dashboard */
    private static function activity(): array
    {
        $rows = [];
        foreach (array_slice(self::notificationRows(), 0, 8) as $n) {
            $rows[] = [
                'when'   => $n['created_at'],
                'type'   => $n['type'],
                'detail' => $n['title'] . ': ' . $n['body'],
            ];
        }
        return $rows;
    }

    // ============================================================== internals

    /**
     * @param array<int,array<string,mixed>> $rows
     * @return array<string,mixed>|null
     */
    private static function findById(array $rows, string $key, int $id): ?array
    {
        foreach ($rows as $row) {
            if ((int) $row[$key] === $id) {
                return $row;
            }
        }
        return null;
    }

    /** @param array<int,array<string,mixed>> $rows */
    private static function sumWhere(array $rows, string $status): float
    {
        $total = 0.0;
        foreach ($rows as $row) {
            if ($row['status'] === $status) {
                $total += $row['amount_lkr'];
            }
        }
        return $total;
    }

    /** A date `$offset` days from the fixed anchor, as YYYY-MM-DD. */
    private static function day(int $offset): string
    {
        return (new DateTimeImmutable(self::ANCHOR))
            ->modify(($offset >= 0 ? '+' : '-') . abs($offset) . ' days')
            ->format('Y-m-d');
    }

    private static function ref(string $prefix, int $number): string
    {
        return $prefix . '-' . $number;
    }
}
