<?php
/**
 * Creating a customer touches two tables (`users` + `customers`), and the schema
 * doesn't keep the subtype row consistent with users.role, so both inserts run
 * in one transaction here.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/CustomerModel.php';

final class CustomerRegistrationService
{
    /**
     * @param array{email:string,password:string,full_name:string,phone:string,address:string,district:string,company:?string} $in
     *        already validated and normalised by the controller
     * @return int the new user_id
     * @throws PDOException on any database failure (rolled back); duplicate
     *         email/phone surface as SQLSTATE 23000 for the controller to map
     */
    public static function register(array $in): int
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $userId = UserModel::insert([
                'email'         => $in['email'],
                'password_hash' => password_hash($in['password'], PASSWORD_DEFAULT),
                'role'          => 'customer',
                'full_name'     => $in['full_name'],
                'phone'         => $in['phone'],
                'address_line'  => $in['address'],
                'district'      => $in['district'],
            ]);
            CustomerModel::insert($userId, $in['company'], $in['address']);
            $db->commit();
            return $userId;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }
}
