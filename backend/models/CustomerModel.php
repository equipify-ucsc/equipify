<?php
/**
 * SQL for the `customers` subtype table (1:0..1 on users.user_id).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class CustomerModel
{
    public static function insert(int $userId, ?string $companyName, string $billingAddress): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO customers (user_id, company_name, billing_address)
             VALUES (:user_id, :company_name, :billing_address)'
        );
        $stmt->execute([
            ':user_id'         => $userId,
            ':company_name'    => $companyName,
            ':billing_address' => $billingAddress,
        ]);
    }

    /** The customer's own profile: base user columns plus the subtype row. */
    public static function findProfile(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT u.user_id, u.full_name, u.email, u.phone,
                    u.address_line, u.district, u.created_at,
                    c.company_name, c.billing_address,
                    c.freelancer_avg_rating, c.freelancer_rating_count,
                    c.renting_party_avg_rating, c.renting_party_rating_count
               FROM customers c
               JOIN users u ON u.user_id = c.user_id
              WHERE c.user_id = :id
              LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}
