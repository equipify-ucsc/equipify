<?php
/**
 * Creating a renting party touches three tables (`users`, `renting_parties`,
 * `credential_docs`), so the inserts run in one transaction. Uploaded files are
 * written first and removed again if the transaction fails.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../core/Upload.php';
require_once __DIR__ . '/../models/UserModel.php';
require_once __DIR__ . '/../models/RentingPartyModel.php';
require_once __DIR__ . '/../models/CredentialDocModel.php';

final class RentingPartyRegistrationService
{
    /**
     * @param array{email:string,password:string,owner_name:string,phone:string,business_name:string,reg_no:string,address:string,district:string} $in
     *        already validated and normalised by the controller
     * @param array{bytes:string,ext:string}      $certificate prepared BR certificate
     * @param array{bytes:string,ext:string}|null $logo        prepared logo, if any
     * @return int the new user_id
     * @throws PDOException on any database failure (rolled back); duplicate
     *         email/phone/registration number surface as SQLSTATE 23000
     */
    public static function register(array $in, array $certificate, ?array $logo): int
    {
        $stored = [];
        $db = getDbConnection();
        try {
            $certPath = $stored[] = Upload::store($certificate);
            $logoPath = $logo === null ? null : ($stored[] = Upload::store($logo));

            $db->beginTransaction();
            $userId = UserModel::insert([
                'email'         => $in['email'],
                'password_hash' => password_hash($in['password'], PASSWORD_DEFAULT),
                'role'          => 'renting_party',
                'full_name'     => $in['owner_name'],
                'phone'         => $in['phone'],
                'address_line'  => $in['address'],
                'district'      => $in['district'],
            ]);
            RentingPartyModel::insert(
                $userId,
                $in['business_name'],
                $in['reg_no'],
                $in['address'],
                $in['district'],
                $logoPath
            );
            CredentialDocModel::insert($userId, 'business_registration', $certPath);
            $db->commit();
            return $userId;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            foreach ($stored as $path) {
                Upload::discard($path);
            }
            throw $e;
        }
    }
}
