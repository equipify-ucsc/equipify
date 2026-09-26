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

    /** The subtype row for a profile page (the `users` part comes from UserModel::findAccount). */
    public static function findDetails(int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT company_name, billing_address,
                    freelancer_avg_rating, freelancer_rating_count,
                    renting_party_avg_rating, renting_party_rating_count
               FROM customers WHERE user_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** The columns a customer edits about themselves. Ratings are the platform's. */
    public static function updateDetails(int $userId, ?string $companyName, string $billingAddress): void
    {
        $stmt = getDbConnection()->prepare(
            'UPDATE customers
                SET company_name = :company_name, billing_address = :billing_address
              WHERE user_id = :id'
        );
        $stmt->execute([
            ':company_name'    => $companyName,
            ':billing_address' => $billingAddress,
            ':id'              => $userId,
        ]);
    }
}
