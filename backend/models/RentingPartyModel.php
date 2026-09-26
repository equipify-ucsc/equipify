<?php
/**
 * SQL for the `renting_parties` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class RentingPartyModel
{
    public static function regNoExists(string $regNo): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM renting_parties WHERE business_reg_no = :reg LIMIT 1'
        );
        $stmt->execute([':reg' => $regNo]);
        return $stmt->fetchColumn() !== false;
    }

    /** New parties start with verification_status = 'pending' (the column default). */
    public static function insert(
        int $userId,
        string $businessName,
        string $regNo,
        string $address,
        string $district,
        ?string $logoUrl
    ): void {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO renting_parties (user_id, business_name, business_reg_no, business_address, district, logo_url)
             VALUES (:user_id, :business_name, :reg_no, :address, :district, :logo_url)'
        );
        $stmt->execute([
            ':user_id'       => $userId,
            ':business_name' => $businessName,
            ':reg_no'        => $regNo,
            ':address'       => $address,
            ':district'      => $district,
            ':logo_url'      => $logoUrl,
        ]);
    }

    /** The subtype row for a profile page (the `users` part comes from UserModel::findAccount). */
    public static function findDetails(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT business_name, business_reg_no, business_address, district,
                    description, verification_status, avg_rating, rating_count
               FROM renting_parties WHERE user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * The business columns the party edits itself. business_reg_no and
     * verification_status are absent on purpose: an admin verifies those.
     *
     * @param array{business_name:string,business_address:string,district:string,description:?string} $b
     */
    public static function updateDetails(int $userId, array $b): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE renting_parties
                SET business_name    = :business_name,
                    business_address = :business_address,
                    district         = :district,
                    description      = :description
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':business_name'    => $b['business_name'],
            ':business_address' => $b['business_address'],
            ':district'         => $b['district'],
            ':description'      => $b['description'],
            ':id'               => $userId,
        ]);
    }
}
