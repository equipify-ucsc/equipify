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

    // ------------------------------------------------------------ admin views

    /**
     * One page of every user's documents for the admin's verification queue:
     * pending first, then newest. The filters are already checked against the
     * column enums by the controller.
     *
     * @param array{q?:string,role?:string,status?:string} $filters
     * @return array<int,array<string,mixed>>
     */
    public static function pageForAdmin(array $filters, int $limit, int $offset): array
    {
        [$where, $bind] = self::adminConditions($filters);

        $stmt = getDbConnection()->prepare(
            "SELECT cd.credential_doc_id, cd.doc_type, cd.verification_status,
                    cd.rejection_reason, cd.submitted_at, cd.verified_at,
                    u.user_id, u.full_name, u.role, rp.business_name
               FROM credential_docs cd
               JOIN users u ON u.user_id = cd.user_id
               LEFT JOIN renting_parties rp ON rp.user_id = cd.user_id
              " . $where . "
              ORDER BY (cd.verification_status = 'pending') DESC,
                       cd.submitted_at DESC, cd.credential_doc_id DESC
              LIMIT " . $limit . ' OFFSET ' . $offset
        );
        $stmt->execute($bind);
        return $stmt->fetchAll();
    }

    /** @param array{q?:string,role?:string,status?:string} $filters */
    public static function countForAdmin(array $filters): int
    {
        [$where, $bind] = self::adminConditions($filters);
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*)
               FROM credential_docs cd
               JOIN users u ON u.user_id = cd.user_id
               LEFT JOIN renting_parties rp ON rp.user_id = cd.user_id ' . $where
        );
        $stmt->execute($bind);
        return (int) $stmt->fetchColumn();
    }

    /**
     * The three counts on the verification page's summary tiles, over every
     * document regardless of the list's filters.
     *
     * @return array{pending:int,verified_today:int,rejected:int}
     */
    public static function summary(): array
    {
        $row = getDbConnection()->query(
            "SELECT SUM(verification_status = 'pending') AS pending,
                    SUM(verification_status = 'verified' AND DATE(verified_at) = CURDATE()) AS verified_today,
                    SUM(verification_status = 'rejected') AS rejected
               FROM credential_docs"
        )->fetch();

        return [
            'pending'        => (int) ($row['pending'] ?? 0),
            'verified_today' => (int) ($row['verified_today'] ?? 0),
            'rejected'       => (int) ($row['rejected'] ?? 0),
        ];
    }

    /**
     * One document with its stored path and its uploader's role, for the
     * admin file view and decisions.
     *
     * @return array<string,mixed>|null
     */
    public static function findForAdmin(int $docId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT cd.credential_doc_id, cd.user_id, cd.doc_type, cd.file_url,
                    cd.verification_status, u.role
               FROM credential_docs cd
               JOIN users u ON u.user_id = cd.user_id
              WHERE cd.credential_doc_id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $docId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Records an admin's decision on a document that is still pending.
     *
     * @return bool false when it was already decided (nothing is changed)
     */
    public static function decide(int $docId, string $status, int $adminId, ?string $reason): bool
    {
        $stmt = getDbConnection()->prepare(
            "UPDATE credential_docs
                SET verification_status = :status,
                    verified_by         = :admin,
                    verified_at         = NOW(),
                    rejection_reason    = :reason
              WHERE credential_doc_id = :id AND verification_status = 'pending'"
        );
        $stmt->execute([
            ':status' => $status,
            ':admin'  => $adminId,
            ':reason' => $status === 'rejected' ? $reason : null,
            ':id'     => $docId,
        ]);
        return $stmt->rowCount() === 1;
    }

    /**
     * @param array{q?:string,role?:string,status?:string} $filters
     * @return array{0:string,1:array<string,mixed>}
     */
    private static function adminConditions(array $filters): array
    {
        $where = [];
        $bind  = [];

        if (($filters['q'] ?? '') !== '') {
            $where[] = '(u.full_name LIKE :q1 OR rp.business_name LIKE :q2 OR cd.doc_type LIKE :q3)';
            $like = '%' . $filters['q'] . '%';
            $bind[':q1'] = $like;
            $bind[':q2'] = $like;
            // doc_type is stored as e.g. business_registration, so match "business registration" too.
            $bind[':q3'] = '%' . str_replace(' ', '_', $filters['q']) . '%';
        }
        if (($filters['role'] ?? '') !== '') {
            $where[] = 'u.role = :role';
            $bind[':role'] = $filters['role'];
        }
        if (($filters['status'] ?? '') !== '') {
            $where[] = 'cd.verification_status = :status';
            $bind[':status'] = $filters['status'];
        }

        return [$where === [] ? '' : 'WHERE ' . implode(' AND ', $where), $bind];
    }
}
