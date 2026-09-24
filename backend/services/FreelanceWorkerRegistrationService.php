<?php
/**
 * Creating a freelance worker (equipment operator) touches two tables
 * (`users` + `freelance_workers`), and the schema doesn't keep the subtype row
 * consistent with users.role, so both inserts run in one transaction here.
 *
 * Credential documents are not part of sign-up: the worker uploads them later
 * from the Credentials page, which is why nothing is written to disk here.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/FreelanceWorkerModel.php';

final class FreelanceWorkerRegistrationService
{
    /**
     * @param array{email:string,password:string,full_name:string,phone:string,nic_number:?string,address:string,district:string,bio:?string,years_experience:?int} $in
     *        already validated and normalised by the controller
     * @return int the new user_id
     * @throws PDOException on any database failure (rolled back); duplicate
     *         email/phone/NIC surface as SQLSTATE 23000 for the controller to map
     */
    public static function register(array $in): int
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $userId = UserModel::insert([
                'email'         => $in['email'],
                'password_hash' => password_hash($in['password'], PASSWORD_DEFAULT),
                'role'          => 'freelance_worker',
                'full_name'     => $in['full_name'],
                'phone'         => $in['phone'],
                'address_line'  => $in['address'],
                'district'      => $in['district'],
                'nic_number'    => $in['nic_number'],
            ]);
            FreelanceWorkerModel::insert($userId, [
                'bio'              => $in['bio'],
                'years_experience' => $in['years_experience'],
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
