<?php
/**
 * SQL for the `freelance_workers` subtype table (1:0..1 on users.user_id).
 *
 * Unlike maintenance techs and delivery personnel, freelance workers sign
 * themselves up, so there is no `registered_by` column to fill.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class FreelanceWorkerModel
{
    /**
     * Inserts the subtype row. Does not manage a transaction: the caller (a
     * service) wraps this with the `users` insert.
     *
     * @param array{bio:?string,years_experience:?int} $f
     */
    public static function insert(int $userId, array $f): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO freelance_workers
                 (user_id, bio, years_experience)
             VALUES (:user_id, :bio, :years_experience)'
        );
        $stmt->execute([
            ':user_id'          => $userId,
            ':bio'              => $f['bio'],
            ':years_experience' => $f['years_experience'],
        ]);
    }

    /**
     * The signed-in worker's own profile: the account fields they may edit plus
     * every freelance_workers column, including the ones only the platform
     * writes (verification_status, avg_rating, rating_count).
     *
     * @return array<string,mixed>|null
     */
    public static function findProfile(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.phone, u.nic_number,
                    u.address_line, u.district, u.profile_photo_url,
                    u.account_status, u.created_at,
                    fw.bio, fw.years_experience,
                    fw.availability_status, fw.verification_status,
                    fw.avg_rating, fw.rating_count
               FROM freelance_workers fw
               JOIN users u ON u.user_id = fw.user_id
              WHERE fw.user_id = :id
              LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Updates only the columns a worker owns. verification_status, avg_rating
     * and rating_count are deliberately absent: the platform sets those.
     *
     * @param array{bio:?string,years_experience:?int,availability_status:string} $f
     */
    public static function updateProfile(int $userId, array $f): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE freelance_workers
                SET bio                 = :bio,
                    years_experience    = :years_experience,
                    availability_status = :availability_status
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':bio'                 => $f['bio'],
            ':years_experience'    => $f['years_experience'],
            ':availability_status' => $f['availability_status'],
            ':id'                  => $userId,
        ]);
    }

    /** Availability on its own, for the one-select toggle on the dashboard. */
    public static function updateAvailability(int $userId, string $status): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE freelance_workers SET availability_status = :s WHERE user_id = :id'
        );
        $stmt->execute([':s' => $status, ':id' => $userId]);
    }
}
