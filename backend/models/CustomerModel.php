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
}
