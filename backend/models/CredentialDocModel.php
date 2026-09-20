<?php
/**
 * SQL for the `credential_docs` table (documents an admin later verifies).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class CredentialDocModel
{
    /** Stored as 'pending' until an admin reviews it. */
    public static function insert(int $userId, string $docType, string $fileUrl): void
    {
        $stmt = getDbConnection()->prepare(
            'INSERT INTO credential_docs (user_id, doc_type, file_url)
             VALUES (:user_id, :doc_type, :file_url)'
        );
        $stmt->execute([
            ':user_id'  => $userId,
            ':doc_type' => $docType,
            ':file_url' => $fileUrl,
        ]);
    }
}
