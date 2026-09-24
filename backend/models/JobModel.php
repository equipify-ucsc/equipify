<?php
/**
 * SQL for the `jobs` table: fixed-price job offers customers post for
 * freelance workers.
 *
 * Customer-side queries filter on customer_id, so a guessed job_id can never
 * reach another customer's job. Worker-side queries only ever see jobs that
 * have been published (never drafts).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class JobModel
{
    private const COLUMNS =
        'j.job_id, j.customer_id, j.title, j.equipment, j.description, j.district,
         j.site, j.start_date, j.end_date, j.budget_lkr, j.status, j.hired_worker_id,
         j.published_at, j.hired_at, j.completed_at, j.cancelled_at, j.created_at,
         j.updated_at';

    /** The customer's name as workers see it: the company, or the person. */
    private const CUSTOMER_NAME = 'COALESCE(NULLIF(c.company_name, \'\'), cu.full_name)';

    // ------------------------------------------------------------ customer side

    /**
     * Every job this customer has posted, newest first, with its bid count
     * and the name of the worker hired (when there is one).
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForCustomer(int $customerId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . ',
                    (SELECT COUNT(*) FROM job_bids b WHERE b.job_id = j.job_id) AS bid_count,
                    hw.full_name AS hired_worker_name
               FROM jobs j
               LEFT JOIN users hw ON hw.user_id = j.hired_worker_id
              WHERE j.customer_id = :customer_id
              ORDER BY j.job_id DESC'
        );
        $stmt->execute([':customer_id' => $customerId]);
        return $stmt->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public static function findForCustomer(int $jobId, int $customerId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . ',
                    (SELECT COUNT(*) FROM job_bids b WHERE b.job_id = j.job_id) AS bid_count,
                    hw.full_name AS hired_worker_name
               FROM jobs j
               LEFT JOIN users hw ON hw.user_id = j.hired_worker_id
              WHERE j.job_id = :id AND j.customer_id = :customer_id'
        );
        $stmt->execute([':id' => $jobId, ':customer_id' => $customerId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * @param array{title:string,equipment:string,description:?string,district:string,
     *              site:string,start_date:string,end_date:string,budget_lkr:string} $job
     * @param bool $publish true creates it open (visible to workers), false as a draft
     * @return int the new job_id
     */
    public static function insert(int $customerId, array $job, bool $publish): int
    {
        $db   = getDbConnection();
        $stmt = $db->prepare(
            'INSERT INTO jobs
                 (customer_id, title, equipment, description, district, site,
                  start_date, end_date, budget_lkr, status, published_at)
             VALUES (:customer_id, :title, :equipment, :description, :district, :site,
                     :start_date, :end_date, :budget, :status, '
                     . ($publish ? 'CURRENT_TIMESTAMP' : 'NULL') . ')'
        );
        $stmt->execute([
            ':customer_id' => $customerId,
            ':title'       => $job['title'],
            ':equipment'   => $job['equipment'],
            ':description' => $job['description'],
            ':district'    => $job['district'],
            ':site'        => $job['site'],
            ':start_date'  => $job['start_date'],
            ':end_date'    => $job['end_date'],
            ':budget'      => $job['budget_lkr'],
            ':status'      => $publish ? 'open' : 'draft',
        ]);
        return (int) $db->lastInsertId();
    }

    /**
     * Rewrites a job's details. Only a draft, or an open job nobody has bid on
     * yet, can change: once a worker has priced the job, its terms are fixed.
     * The condition is repeated here so a bid that lands between the
     * controller's check and this update still wins.
     *
     * @param array{title:string,equipment:string,description:?string,district:string,
     *              site:string,start_date:string,end_date:string,budget_lkr:string} $job
     */
    public static function update(int $jobId, int $customerId, array $job): void
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE jobs
                SET title       = :title,
                    equipment   = :equipment,
                    description = :description,
                    district    = :district,
                    site        = :site,
                    start_date  = :start_date,
                    end_date    = :end_date,
                    budget_lkr  = :budget
              WHERE job_id = :id AND customer_id = :customer_id
                AND (status = 'draft'
                     OR (status = 'open'
                         AND NOT EXISTS (SELECT 1 FROM job_bids b WHERE b.job_id = jobs.job_id)))"
        );
        $stmt->execute([
            ':title'       => $job['title'],
            ':equipment'   => $job['equipment'],
            ':description' => $job['description'],
            ':district'    => $job['district'],
            ':site'        => $job['site'],
            ':start_date'  => $job['start_date'],
            ':end_date'    => $job['end_date'],
            ':budget'      => $job['budget_lkr'],
            ':id'          => $jobId,
            ':customer_id' => $customerId,
        ]);
    }

    /** Hard-deletes a draft. @return bool false when it isn't this customer's draft */
    public static function deleteDraft(int $jobId, int $customerId): bool
    {
        $stmt = getDbConnection()->prepare(
            "DELETE FROM jobs
              WHERE job_id = :id AND customer_id = :customer_id AND status = 'draft'"
        );
        $stmt->execute([':id' => $jobId, ':customer_id' => $customerId]);
        return $stmt->rowCount() === 1;
    }

    /** draft -> open. @return bool false when the job wasn't a draft */
    public static function publish(int $jobId, int $customerId): bool
    {
        return self::transition($jobId, $customerId, 'draft', 'open', 'published_at');
    }

    /** open -> cancelled. Run inside JobHiringService::cancel(). */
    public static function cancel(int $jobId, int $customerId): bool
    {
        return self::transition($jobId, $customerId, 'open', 'cancelled', 'cancelled_at');
    }

    /** hired -> completed. */
    public static function complete(int $jobId, int $customerId): bool
    {
        return self::transition($jobId, $customerId, 'hired', 'completed', 'completed_at');
    }

    /** open -> hired, recording who. Run inside JobHiringService::hire(). */
    public static function markHired(int $jobId, int $customerId, int $workerId): bool
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE jobs
                SET status = 'hired', hired_worker_id = :worker_id, hired_at = CURRENT_TIMESTAMP
              WHERE job_id = :id AND customer_id = :customer_id AND status = 'open'"
        );
        $stmt->execute([':worker_id' => $workerId, ':id' => $jobId, ':customer_id' => $customerId]);
        return $stmt->rowCount() === 1;
    }

    // -------------------------------------------------------------- worker side

    /**
     * A published job (any status but draft) with the customer's name, for
     * the checks behind bidding and declining. start_passed uses the
     * database's date, the same clock offersQuery() marks offers expired by.
     *
     * @return array<string,mixed>|null
     */
    public static function findPublished(int $jobId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT ' . self::COLUMNS . ', ' . self::CUSTOMER_NAME . ' AS customer_name,
                    j.start_date < CURDATE() AS start_passed
               FROM jobs j
               JOIN customers c ON c.user_id = j.customer_id
               JOIN users cu ON cu.user_id = j.customer_id
              WHERE j.job_id = :id AND j.status <> \'draft\''
        );
        $stmt->execute([':id' => $jobId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * One page of the Job Offers list for a worker: every open job, plus any
     * job they have bid on or declined, whatever became of it. offer_status is
     * that job as this worker sees it (see offersQuery()).
     *
     * @param array{q:string,status:string,district:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function offersForWorker(int $workerId, array $filters, int $limit, int $offset): array
    {
        [$sql, $bind] = self::offersQuery($workerId, $filters);
        $stmt = getDbConnection()->prepare(
            'SELECT * FROM (' . $sql . ') o
              ORDER BY o.offer_status = \'open\' DESC, o.published_at DESC, o.job_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /** @param array{q:string,status:string,district:string} $filters */
    public static function countOffersForWorker(int $workerId, array $filters): int
    {
        [$sql, $bind] = self::offersQuery($workerId, $filters);
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM (' . $sql . ') o');
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    // ---------------------------------------------------------------- internals

    /**
     * The offers query shared by the page and its count, so the two can never
     * drift. The per-worker status is derived here:
     *
     *   declined  the worker said "Not interested" (job_declines)
     *   accepted  the customer hired this worker
     *   expired   hired to someone else, cancelled, or the start date passed
     *   open      still taking bids
     *
     * The status filter applies to that derived value, so it wraps the query.
     * Each placeholder appears once: with emulated prepares off, MySQL won't
     * accept the same named placeholder twice.
     *
     * @param array{q:string,status:string,district:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function offersQuery(int $workerId, array $filters): array
    {
        $where = ["(j.status = 'open' OR d.job_id IS NOT NULL OR mb.bid_id IS NOT NULL)"];
        $bind  = [
            ':worker_hired'   => $workerId,
            ':worker_decline' => $workerId,
            ':worker_bid'     => $workerId,
        ];

        if ($filters['q'] !== '') {
            $where[] = '(j.title LIKE :q_title OR j.equipment LIKE :q_equipment
                         OR ' . self::CUSTOMER_NAME . ' LIKE :q_customer
                         OR CONCAT(\'JOB-\', j.job_id) LIKE :q_ref)';
            $term = '%' . addcslashes($filters['q'], '%_\\') . '%';
            $bind[':q_title']     = $term;
            $bind[':q_equipment'] = $term;
            $bind[':q_customer']  = $term;
            $bind[':q_ref']       = $term;
        }
        if ($filters['district'] !== '') {
            $where[] = 'j.district = :district';
            $bind[':district'] = $filters['district'];
        }

        $sql = 'SELECT j.job_id, j.title, j.equipment, j.district, j.site,
                       j.start_date, j.end_date, j.budget_lkr, j.published_at,
                       ' . self::CUSTOMER_NAME . ' AS customer_name,
                       mb.bid_amount_lkr AS my_bid_amount_lkr,
                       CASE
                           WHEN d.job_id IS NOT NULL THEN \'declined\'
                           WHEN j.status IN (\'hired\', \'completed\')
                                AND j.hired_worker_id = :worker_hired THEN \'accepted\'
                           WHEN j.status <> \'open\' OR j.start_date < CURDATE() THEN \'expired\'
                           ELSE \'open\'
                       END AS offer_status
                  FROM jobs j
                  JOIN customers c ON c.user_id = j.customer_id
                  JOIN users cu ON cu.user_id = j.customer_id
                  LEFT JOIN job_declines d
                         ON d.job_id = j.job_id AND d.worker_id = :worker_decline
                  LEFT JOIN job_bids mb
                         ON mb.job_id = j.job_id AND mb.worker_id = :worker_bid
                 WHERE ' . implode(' AND ', $where);

        if ($filters['status'] !== '') {
            $sql = 'SELECT * FROM (' . $sql . ') s WHERE s.offer_status = :status';
            $bind[':status'] = $filters['status'];
        }

        return [$sql, $bind];
    }

    /**
     * A guarded status change: only moves the job when it is currently in
     * $from, and stamps the matching timestamp column. Both column and status
     * names come from the callers above, never from the request.
     */
    private static function transition(int $jobId, int $customerId, string $from, string $to, string $stampColumn): bool
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE jobs
                SET status = :to, ' . $stampColumn . ' = CURRENT_TIMESTAMP
              WHERE job_id = :id AND customer_id = :customer_id AND status = :from'
        );
        $stmt->execute([':to' => $to, ':id' => $jobId, ':customer_id' => $customerId, ':from' => $from]);
        return $stmt->rowCount() === 1;
    }
}
