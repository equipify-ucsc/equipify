<?php
/** CLI only; no users, complaints, files or schema are written. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../models/ComplaintModel.php';
require_once __DIR__ . '/../core/Upload.php';

$checks = 0;
function check(bool $condition, string $label): void
{
    global $checks;
    if (!$condition) throw new RuntimeException('FAILED: ' . $label);
    $checks++;
}
$expected = [
    'customer' => ['renting_party', 'freelance_worker', 'delivery_personnel'],
    'renting_party' => ['customer', 'freelance_worker', 'delivery_personnel', 'maintenance_tech'],
    'freelance_worker' => ['customer'], 'maintenance_tech' => ['renting_party'],
    'delivery_personnel' => ['customer'], 'admin' => [], 'area_manager' => [],
];
foreach ($expected as $role => $allowed) {
    foreach (array_keys($expected) as $targetRole) {
        check(ComplaintModel::canTarget(10, $role, 20, $targetRole) === in_array($targetRole, $allowed, true), "$role -> $targetRole");
        check(!ComplaintModel::canTarget(10, $role, 10, $targetRole), "Self target: $role -> $targetRole");
    }
}
check(!ComplaintModel::canTarget(10, 'unknown', 20, 'customer'), 'Unknown complainant role');
check(!ComplaintModel::canTarget(10, 'customer', 20, 'unknown'), 'Unknown target role');
$row = ['complainant_id' => 10];
foreach (array_keys($expected) as $role) {
    check(ComplaintModel::canView($row, 10, $role), 'Owner reads own complaint');
    check(ComplaintModel::canView($row, 20, $role) === in_array($role, ['admin', 'area_manager'], true), 'Other-user visibility: ' . $role);
}
check(is_string(Upload::prepare(['data' => 'not base64!'], Upload::DOCUMENTS, 5242880, 'Evidence')), 'Invalid base64 rejected');
check(is_string(Upload::prepare(['data' => base64_encode('<script>alert(1)</script>')], Upload::DOCUMENTS, 5242880, 'Evidence')), 'Executable content rejected');
check(is_string(Upload::prepare(['data' => str_repeat('A', 6990520)], Upload::DOCUMENTS, 5242880, 'Evidence')), 'Oversize rejected');
$pdf = file_get_contents(__DIR__ . '/../../frontend/Admin/Document Verification/test-document.pdf');
check(is_array(Upload::prepare(['name' => '../../evil.php', 'data' => base64_encode($pdf)], Upload::DOCUMENTS, 5242880, 'Evidence')), 'PDF bytes accepted regardless of untrusted filename');

// Read-only SQL integration checks against the configured project database.
if (in_array('--database', $argv, true)) {
    $db = getDbConnection();
    foreach ($expected as $role => $allowed) {
        foreach (ComplaintModel::targets(0, $role) as $target) {
            check(in_array($target['role'], $allowed, true), 'Database target respects role policy');
        }
    }
    $page = ComplaintModel::listing(null, '', '', '', 'created_at', 'desc', 1, 10);
    check($page['total'] === (int) $db->query('SELECT COUNT(*) FROM complaints')->fetchColumn(), 'Reviewer list count');
    $filtered = ComplaintModel::listing(null, '', '', 'Payment / Billing', 'subject', 'asc', 1, 10);
    foreach ($filtered['items'] as $item) check($item['category'] === 'Payment / Billing', 'Category filter');
    check(ComplaintModel::find(PHP_INT_MAX) === null, 'Unknown complaint is absent');
    check(ComplaintModel::listing(PHP_INT_MAX, '', '', '', 'invalid', 'invalid', 1, 10)['total'] === 0, 'Owner scope');
}
echo "PASS: $checks complaint policy, visibility, upload and optional database checks.\n";
