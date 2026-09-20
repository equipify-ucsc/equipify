<?php
/**
 * An admin registers an area manager: `users` + `area_managers` rows in one transaction.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/AreaManagerModel.php';

final class AreaManagerRegistrationService
{
    /**
     * @param array{email:string,password:string,full_name:string,phone:string,district:string} $in
     *        already validated and normalised by the controller
     * @return int the new user_id
     * @throws PDOException on any database failure (rolled back); duplicate
     *         email/phone surface as SQLSTATE 23000 for the controller to map
     */
    public static function register(array $in, int $adminId): int
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $userId = UserModel::insert([
                'email'         => $in['email'],
                'password_hash' => password_hash($in['password'], PASSWORD_DEFAULT),
                'role'          => 'area_manager',
                'full_name'     => $in['full_name'],
                'phone'         => $in['phone'],
                'address_line'  => null,
                'district'      => $in['district'],
            ]);
            AreaManagerModel::insert($userId, $adminId);
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
