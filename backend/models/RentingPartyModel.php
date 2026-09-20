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
}
