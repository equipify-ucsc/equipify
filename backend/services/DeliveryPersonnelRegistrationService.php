<?php
/**
 * An area manager registers a delivery personnel account: `users` +
 * `delivery_personnel` rows in one transaction.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/DeliveryPersonnelModel.php';

final class DeliveryPersonnelRegistrationService
{
    /**
     * @param array{email:string,password:string,full_name:string,phone:string,district:?string,
     *              driving_license_no:string,license_class:string,license_expiry:string} $in
     *        already validated and normalised by the controller
     * @return int the new user_id
     * @throws PDOException on any database failure (rolled back); duplicate
     *         email/phone/license surface as SQLSTATE 23000 for the controller to map
     */
    public static function register(array $in, int $areaManagerId): int
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $userId = UserModel::insert([
                'email'         => $in['email'],
                'password_hash' => password_hash($in['password'], PASSWORD_DEFAULT),
                'role'          => 'delivery_personnel',
                'full_name'     => $in['full_name'],
                'phone'         => $in['phone'],
                'address_line'  => null,
                'district'      => $in['district'],
            ]);
            DeliveryPersonnelModel::insert($userId, $areaManagerId, [
                'driving_license_no' => $in['driving_license_no'],
                'license_class'      => $in['license_class'],
                'license_expiry'     => $in['license_expiry'],
            ]);
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
