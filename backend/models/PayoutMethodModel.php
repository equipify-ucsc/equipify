<?php
/**
 * SQL for the `payout_methods` table (where a professional's earnings are sent).
 *
 * The encrypted blob arrives already sealed and leaves still sealed: this class
 * only moves it. Encryption is the controller's call, because only the
 * controller knows the session user the ciphertext is bound to, and a model
 * that could decrypt would be a model that reads a key it has no business
 * holding.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/db_config.php';

final class PayoutMethodModel
{
    /**
     * @param array{label:string,category:string,provider:string,details_cipher:string,
     *              details_fingerprint:string,key_version:int,is_default:bool} $method
     * @return int the new payout_method_id
     */
    public static function insert(int $userId, array $method): int
    {
        $db = getDbConnection();

        // "Make this the default" has to clear the previous default, and a row
        // that is inserted while another is still marked default would leave
        // the account with two. One transaction, so there is never a moment
        // where that is visible.
        $db->beginTransaction();
        try {
            if ($method['is_default']) {
                self::clearDefault($db, $userId);
            }

            $stmt = $db->prepare(
                'INSERT INTO payout_methods
                     (user_id, label, category, provider, details_cipher,
                      details_fingerprint, key_version, is_default)
                 VALUES (:user_id, :label, :category, :provider, :cipher,
                         :fingerprint, :key_version, :is_default)'
            );
            $stmt->execute([
                ':user_id'     => $userId,
                ':label'       => $method['label'],
                ':category'    => $method['category'],
                ':provider'    => $method['provider'],
                ':cipher'      => $method['details_cipher'],
                ':fingerprint' => $method['details_fingerprint'],
                ':key_version' => $method['key_version'],
                ':is_default'  => $method['is_default'] ? 1 : 0,
            ]);
            $id = (int) $db->lastInsertId();

            $db->commit();
            return $id;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Every method this user has saved, default first, then newest.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function allForUser(int $userId): array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT payout_method_id, label, category, provider, details_cipher,
                    key_version, is_default, created_at
               FROM payout_methods
              WHERE user_id = :user_id
              ORDER BY is_default DESC, payout_method_id DESC'
        );
        $stmt->execute([':user_id' => $userId]);
        return $stmt->fetchAll();
    }

    /**
     * One method, but only if it belongs to this user. The ownership test is
     * part of the query, so a guessed id can never reach someone else's row.
     *
     * @return array<string,mixed>|null
     */
    public static function findForUser(int $methodId, int $userId): ?array
    {
        $stmt = getDbConnection()->prepare(
            'SELECT payout_method_id, label, category, provider, details_cipher,
                    key_version, is_default, created_at
               FROM payout_methods
              WHERE payout_method_id = :id AND user_id = :user_id'
        );
        $stmt->execute([':id' => $methodId, ':user_id' => $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Whether this user has already saved the account behind this fingerprint. */
    public static function fingerprintExists(int $userId, string $fingerprint): bool
    {
        $stmt = getDbConnection()->prepare(
            'SELECT 1 FROM payout_methods
              WHERE user_id = :user_id AND details_fingerprint = :fingerprint
              LIMIT 1'
        );
        $stmt->execute([':user_id' => $userId, ':fingerprint' => $fingerprint]);
        return $stmt->fetchColumn() !== false;
    }

    public static function countForUser(int $userId): int
    {
        $stmt = getDbConnection()->prepare(
            'SELECT COUNT(*) FROM payout_methods WHERE user_id = :user_id'
        );
        $stmt->execute([':user_id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Promotes one method to default and demotes the rest, as one unit.
     *
     * @return bool false when the id isn't this user's
     */
    public static function makeDefault(int $methodId, int $userId): bool
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            self::clearDefault($db, $userId);

            $stmt = $db->prepare(
                'UPDATE payout_methods SET is_default = 1
                  WHERE payout_method_id = :id AND user_id = :user_id'
            );
            $stmt->execute([':id' => $methodId, ':user_id' => $userId]);
            $changed = $stmt->rowCount() === 1;

            $db->commit();
            return $changed;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Deletes one of this user's methods. If it was the default, the next most
     * recent method takes over, so an account that still has a method never
     * ends up with nowhere to send money.
     *
     * @return bool false when the id isn't this user's
     */
    public static function delete(int $methodId, int $userId): bool
    {
        $db = getDbConnection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'DELETE FROM payout_methods
                  WHERE payout_method_id = :id AND user_id = :user_id'
            );
            $stmt->execute([':id' => $methodId, ':user_id' => $userId]);
            if ($stmt->rowCount() !== 1) {
                $db->rollBack();
                return false;
            }

            // MySQL will not let a subquery read the table an UPDATE is
            // writing, so the successor is chosen in PHP and updated by id.
            $successor = $db->prepare(
                'SELECT payout_method_id FROM payout_methods
                  WHERE user_id = :user_id
                  ORDER BY is_default DESC, payout_method_id DESC
                  LIMIT 1'
            );
            $successor->execute([':user_id' => $userId]);
            $nextId = $successor->fetchColumn();

            if ($nextId !== false) {
                $promote = $db->prepare(
                    'UPDATE payout_methods SET is_default = 1
                      WHERE payout_method_id = :id AND user_id = :user_id'
                );
                $promote->execute([':id' => (int) $nextId, ':user_id' => $userId]);
            }

            $db->commit();
            return true;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /** Demotes whichever method is currently the default. Caller holds the transaction. */
    private static function clearDefault(PDO $db, int $userId): void
    {
        $stmt = $db->prepare(
            'UPDATE payout_methods SET is_default = 0
              WHERE user_id = :user_id AND is_default = 1'
        );
        $stmt->execute([':user_id' => $userId]);
    }
}
