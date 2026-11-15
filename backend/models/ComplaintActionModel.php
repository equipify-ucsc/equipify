<?php
declare(strict_types=1);
require_once __DIR__ . '/ComplaintModel.php';

final class ComplaintActionModel
{
    /** Persist status and its audit entry together; unchanged status is a no-op. */
    public static function changeStatus(int $id, string $status, int $actorId): void
    {
        if (!in_array($status, ComplaintModel::STATUSES, true)) throw new InvalidArgumentException('Invalid status.');
        $db = getDbConnection();
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        else $db->exec('SAVEPOINT complaint_status');
        try {
            $stmt = $db->prepare('SELECT status FROM complaints WHERE complaint_id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $previous = $stmt->fetchColumn();
            if ($previous === false) throw new DomainException('Complaint not found.');
            if ($previous !== $status) {
                ComplaintModel::updateStatus($id, $status);
                $stmt = $db->prepare("INSERT INTO complaint_actions
                    (complaint_id, actor_user_id, action_type, description, previous_status, new_status)
                    VALUES (?, ?, 'status_changed', ?, ?, ?)");
                $stmt->execute([$id, $actorId, 'Status changed to ' . $status, $previous, $status]);
            }
            if ($ownsTransaction) $db->commit();
            else $db->exec('RELEASE SAVEPOINT complaint_status');
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                if ($ownsTransaction) $db->rollBack();
                else {
                    $db->exec('ROLLBACK TO SAVEPOINT complaint_status');
                    $db->exec('RELEASE SAVEPOINT complaint_status');
                }
            }
            throw $e;
        }
    }
}
