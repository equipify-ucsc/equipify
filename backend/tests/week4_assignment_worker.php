<?php
/** Separate processes are required to exercise actual InnoDB lock contention. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once __DIR__ . '/week4_fixture.php';
week4Safety();
$name = $argv[1] ?? '';
if (!preg_match('/\Aequipify_week4_test_[a-z0-9_]+\z/', $name)) throw new RuntimeException('Explicit Week 4 test database required.');
putenv('EQUIPIFY_DB_NAME=' . $name);
require_once __DIR__ . '/../models/DeliveryModel.php';
require_once __DIR__ . '/../models/VehicleModel.php';
if (getDbConnection()->query('SELECT DATABASE()')->fetchColumn() !== $name) throw new RuntimeException('Isolation failed.');
$job = json_decode(base64_decode($argv[2] ?? '', true) ?: '', true, 512, JSON_THROW_ON_ERROR);
echo "READY\n"; flush();
// Both workers connect before the controller releases this test barrier.
$barrier = __DIR__ . '/../../tmp/week4-barrier-' . $job['barrier'];
if (!preg_match('/\A[a-f0-9]{16}\z/', $job['barrier'])) throw new RuntimeException('Invalid barrier.');
$deadline = microtime(true) + 15;
while (!is_file($barrier)) { if (microtime(true) > $deadline) throw new RuntimeException('Barrier timeout.'); usleep(10000); }
try {
    if ($job['action'] === 'cancel') $data = DeliveryModel::cancel($job['manager'], $job['delivery'], $job['version'], 'Synthetic concurrent cancellation');
    elseif ($job['action'] === 'status') $data = DeliveryModel::transition($job['manager'],$job['delivery'],$job['version'],$job['status']);
    elseif ($job['action'] === 'retire') $data = VehicleModel::retire($job['vehicle'],$job['manager']);
    elseif ($job['action'] === 'restore') $data = VehicleModel::restore($job['vehicle'],$job['manager']);
    elseif (in_array($job['action'],['maintenance','available'],true)) {
        $row=VehicleModel::findForManager($job['vehicle'],$job['manager']);
        $row['status']=$job['action'];$data=VehicleModel::update($job['vehicle'],$job['manager'],$row);
    }
    else $data = DeliveryModel::assignPersonnel($job['manager'], $job['delivery'], $job['driver'], $job['start'], $job['end'], $job['version'], $job['vehicle'] ?? null);
    echo json_encode(['status'=>200,'data'=>$data]), "\n";
} catch (DomainException $e) { echo json_encode(['status'=>$e->getCode(),'error'=>$e->getMessage()]), "\n"; }
catch (PDOException $e) {
    if (!in_array((int)($e->errorInfo[1]??0),[1205,1213],true)) throw $e;
    echo json_encode(['status'=>409,'error'=>'Concurrent update; retry.']), "\n";
}
