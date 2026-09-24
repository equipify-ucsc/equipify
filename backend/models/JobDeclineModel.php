<?php
/**
 * SQL for the `job_declines` table: which open jobs a worker has said
 * "Not interested" to. The job itself stays open for everyone else.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class JobDeclineModel
{
    /** Declining twice is harmless: the composite key keeps one row. */
    public static function insert(int $jobId, int $workerId): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT IGNORE INTO job_declines (job_id, worker_id) VALUES (:job_id, :worker_id)'
        );
        $stmt->execute([':job_id' => $jobId, ':worker_id' => $workerId]);
    }

    public static function exists(int $jobId, int $workerId): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM job_declines WHERE job_id = :job_id AND worker_id = :worker_id LIMIT 1'
        );
        $stmt->execute([':job_id' => $jobId, ':worker_id' => $workerId]);
        return $stmt->fetchColumn() !== false;
    }
}
