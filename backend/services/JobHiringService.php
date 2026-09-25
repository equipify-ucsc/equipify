<?php
/**
 * The two job decisions that change a job and its bids together, each in one
 * transaction so a job can never end up hired with its bids still pending:
 *
 *   hire()    open -> hired; the chosen bid wins, every other bid loses
 *   cancel()  open -> cancelled; every pending bid loses
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/JobModel.php';
require_once __DIR__ . '/../models/JobBidModel.php';

final class JobHiringService
{
    /**
     * @param array{bid_id:int|string,worker_id:int|string} $bid a bid already
     *        confirmed to be on this job
     * @return bool false when the job is no longer open or the bid was already
     *         decided (nothing is changed)
     */
    public static function hire(int $jobId, int $customerId, array $bid): bool
    {
        $bidId = (int) $bid['bid_id'];

        return self::inTransaction(static function () use ($jobId, $customerId, $bidId, $bid): bool {
            if (!JobModel::markHired($jobId, $customerId, (int) $bid['worker_id'])
                || !JobBidModel::markWon($bidId, $jobId)) {
                return false;
            }
            JobBidModel::markLost($jobId, $bidId);
            return true;
        });
    }

    /** @return bool false when the job is no longer open (nothing is changed) */
    public static function cancel(int $jobId, int $customerId): bool
    {
        return self::inTransaction(static function () use ($jobId, $customerId): bool {
            if (!JobModel::cancel($jobId, $customerId)) {
                return false;
            }
            JobBidModel::markLost($jobId);
            return true;
        });
    }

    /** Commits when $work returns true, rolls back when it returns false or throws. */
    private static function inTransaction(callable $work): bool
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            if ($work() !== true) {
                $db->rollBack();
                return false;
            }
            $db->commit();
            return true;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }
}
