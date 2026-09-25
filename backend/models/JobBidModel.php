<?php
/**
 * SQL for the `job_bids` table: a worker's fixed total price for a job.
 *
 * Worker-side queries filter on worker_id. The customer-side read
 * (allForJob) takes a job id the controller has already confirmed belongs to
 * the signed-in customer.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class JobBidModel
{
    /** Bids the customer hasn't decided on yet. */
    private const UNDECIDED = "('submitted', 'shortlisted')";

    /**
     * Every bid on one job with what the customer needs to compare bidders,
     * cheapest first.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForJob(int $jobId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT b.bid_id, b.job_id, b.worker_id, b.bid_amount_lkr, b.message,
                    b.status, b.submitted_at,
                    u.full_name AS worker_name, u.district AS worker_district,
                    fw.years_experience, fw.avg_rating, fw.rating_count,
                    fw.verification_status
               FROM job_bids b
               JOIN users u ON u.user_id = b.worker_id
               JOIN freelance_workers fw ON fw.user_id = b.worker_id
              WHERE b.job_id = :job_id
              ORDER BY b.bid_amount_lkr ASC, b.submitted_at ASC, b.bid_id ASC'
        );
        $stmt->execute([':job_id' => $jobId]);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null the bid, only if it is on this job */
    public static function findForJob(int $bidId, int $jobId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT bid_id, job_id, worker_id, bid_amount_lkr, message, status, submitted_at
               FROM job_bids
              WHERE bid_id = :id AND job_id = :job_id'
        );
        $stmt->execute([':id' => $bidId, ':job_id' => $jobId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function existsFor(int $jobId, int $workerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM job_bids WHERE job_id = :job_id AND worker_id = :worker_id LIMIT 1'
        );
        $stmt->execute([':job_id' => $jobId, ':worker_id' => $workerId]);
        return $stmt->fetchColumn() !== false;
    }

    /**
     * A PDOException with SQLSTATE 23000 escapes when this worker already bid
     * on the job (uq_job_bids_job_worker); the caller maps it.
     *
     * @return int the new bid_id
     */
    public static function insert(int $jobId, int $workerId, string $amount, ?string $message): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO job_bids (job_id, worker_id, bid_amount_lkr, message)
             VALUES (:job_id, :worker_id, :amount, :message)'
        );
        $stmt->execute([
            ':job_id'    => $jobId,
            ':worker_id' => $workerId,
            ':amount'    => $amount,
            ':message'   => $message,
        ]);
        return (int) $db->lastInsertId();
    }

    /** The hired bid. @return bool false when it was already decided */
    public static function markWon(int $bidId, int $jobId): bool
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE job_bids SET status = 'won'
              WHERE bid_id = :id AND job_id = :job_id AND status IN " . self::UNDECIDED
        );
        $stmt->execute([':id' => $bidId, ':job_id' => $jobId]);
        return $stmt->rowCount() === 1;
    }

    /** Every undecided bid on the job except $keepBidId (0 = all of them) loses. */
    public static function markLost(int $jobId, int $keepBidId = 0): void
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE job_bids SET status = 'lost'
              WHERE job_id = :job_id AND bid_id <> :keep_id AND status IN " . self::UNDECIDED
        );
        $stmt->execute([':job_id' => $jobId, ':keep_id' => $keepBidId]);
    }

    /**
     * One page of the bids a worker has placed, newest first, with the job
     * they were placed on.
     *
     * @param array{q:string,status:string,district:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function pageForWorker(int $workerId, array $filters, int $limit, int $offset): array
    {
        [$where, $bind] = self::workerConditions($workerId, $filters);
        $stmt = getDbConnection()->prepare(
            "SELECT b.bid_id, b.job_id, b.bid_amount_lkr, b.message, b.status, b.submitted_at,
                    j.title, j.equipment, j.district, j.budget_lkr,
                    COALESCE(NULLIF(c.company_name, ''), cu.full_name) AS customer_name
               FROM job_bids b
               JOIN jobs j ON j.job_id = b.job_id
               JOIN customers c ON c.user_id = j.customer_id
               JOIN users cu ON cu.user_id = j.customer_id
              " . $where . '
              ORDER BY b.submitted_at DESC, b.bid_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /** @param array{q:string,status:string,district:string} $filters */
    public static function countForWorker(int $workerId, array $filters): int
    {
        [$where, $bind] = self::workerConditions($workerId, $filters);
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*)
               FROM job_bids b
               JOIN jobs j ON j.job_id = b.job_id
               JOIN customers c ON c.user_id = j.customer_id
               JOIN users cu ON cu.user_id = j.customer_id
              ' . $where
        );
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Shared WHERE clause for the page and its count. One placeholder per use,
     * since emulated prepares are off.
     *
     * @param array{q:string,status:string,district:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function workerConditions(int $workerId, array $filters): array
    {
        $where = ['b.worker_id = :worker_id'];
        $bind  = [':worker_id' => $workerId];

        if ($filters['q'] !== '') {
            $where[] = "(j.title LIKE :q_title OR j.equipment LIKE :q_equipment
                         OR COALESCE(NULLIF(c.company_name, ''), cu.full_name) LIKE :q_customer
                         OR CONCAT('JOB-', j.job_id) LIKE :q_ref)";
            $term = '%' . addcslashes($filters['q'], '%_\\') . '%';
            $bind[':q_title']     = $term;
            $bind[':q_equipment'] = $term;
            $bind[':q_customer']  = $term;
            $bind[':q_ref']       = $term;
        }
        if ($filters['status'] !== '') {
            $where[] = 'b.status = :status';
            $bind[':status'] = $filters['status'];
        }
        if ($filters['district'] !== '') {
            $where[] = 'j.district = :district';
            $bind[':district'] = $filters['district'];
        }

        return ['WHERE ' . implode(' AND ', $where), $bind];
    }
}
