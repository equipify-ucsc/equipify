<?php
/**
 * An admin's decision on a credential document, in one transaction. A renting
 * party's business registration is what makes the business a verified
 * partner, so deciding that document also sets
 * renting_parties.verification_status; the Business Profile badge reads it.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../models/CredentialDocModel.php';
require_once __DIR__ . '/../models/RentingPartyModel.php';

final class DocumentVerificationService
{
    /**
     * @param array{credential_doc_id:int|string,user_id:int|string,doc_type:string,role:string} $doc
     * @param string $status 'verified' or 'rejected'
     * @return bool false when the document was already decided (nothing is changed)
     */
    public static function decide(array $doc, string $status, int $adminId, ?string $reason): bool
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            if (!CredentialDocModel::decide((int) $doc['credential_doc_id'], $status, $adminId, $reason)) {
                $db->rollBack();
                return false;
            }
            if ($doc['role'] === 'renting_party' && $doc['doc_type'] === 'business_registration') {
                RentingPartyModel::setVerificationStatus((int) $doc['user_id'], $status);
            }
            $db->commit();
            return true;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
}
