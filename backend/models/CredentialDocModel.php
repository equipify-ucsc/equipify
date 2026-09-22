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

    /**
     * One page of a user's own documents, newest first. The optional filters
     * are already checked against the column enums by the controller.
     *
     * @param array{status?:string,doc_type?:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function pageForUser(int $userId, array $filters, int $limit, int $offset): array
    {
        [$where, $bind] = self::conditions($userId, $filters);

        $stmt = getDbConnection()->prepare(
            'SELECT credential_doc_id, doc_type, verification_status,
                    rejection_reason, submitted_at, verified_at
               FROM credential_docs
              ' . $where . '
              ORDER BY submitted_at DESC, credential_doc_id DESC
              LIMIT ' . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /**
     * How many rows the same filters match, for the pager.
     *
     * @param array{status?:string,doc_type?:string} $filters
     */
    public static function countForUser(int $userId, array $filters): int
    {
        [$where, $bind] = self::conditions($userId, $filters);
        $stmt = getDbConnection()->prepare('SELECT COUNT(*) FROM credential_docs ' . $where);
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Shared WHERE clause so the page query and its count can never drift.
     * LIMIT/OFFSET are inlined as integers above because MySQL will not bind
     * them as placeholders in emulated-prepare-off mode; every value that comes
     * from the request is bound.
     *
     * @param array{status?:string,doc_type?:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function conditions(int $userId, array $filters): array
    {
        $where = ['user_id = :user_id'];
        $bind  = [':user_id' => $userId];

        if (($filters['status'] ?? '') !== '') {
            $where[] = 'verification_status = :status';
            $bind[':status'] = $filters['status'];
        }
        if (($filters['doc_type'] ?? '') !== '') {
            $where[] = 'doc_type = :doc_type';
            $bind[':doc_type'] = $filters['doc_type'];
        }

        return ['WHERE ' . implode(' AND ', $where), $bind];
    }
}
