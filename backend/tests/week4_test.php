<?php
declare(strict_types=1);
require_once __DIR__ . '/week4_fixture.php';
require_once __DIR__ . '/../models/DeliveryModel.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../controllers/DeliveryController.php';
final class Captured extends RuntimeException { public $data; public function __construct($data, int $status) { parent::__construct('', $status); $this->data = $data; } }
final class Response {
    public static function ok($data = null, int $status = 200): void { throw new Captured($data, $status); }
    public static function error(string $message, int $status = 400, array $fields = []): void { throw new Captured($message, $status); }
}
final class Router { public static array $body = []; public static function jsonBody(): array { return self::$body; } }
$checks = 0;
function check(bool $ok, string $label): void { global $checks; if (!$ok) throw new RuntimeException('FAIL: ' . $label); $checks++; }
function rejects(callable $action, int $status): void { try { $action(); } catch (DomainException $e) { check($e->getCode() === $status, 'domain rejection ' . $status); return; } throw new RuntimeException('Expected rejection'); }
function controller(string $method, array $params, int $status = 200) { try { DeliveryController::$method($params); } catch (Captured $e) { check($e->getCode() === $status, 'controller ' . $method . ' ' . $status); return $e->data; } throw new RuntimeException('Missing response'); }
$fixture = week4Fixture(); $db = getDbConnection(); $ids = $fixture['ids']; $manager = $ids['area_manager']; $driver = $ids['delivery_personnel']; $other = $ids['driver_two'];
$delivery = week4Delivery($manager); $second = week4Delivery($manager); $foreign = week4Delivery($ids['manager_foreign'], 2);
check(!DeliveryModel::listing(1,1,10)['assignment_supported'], 'old schema listing remains usable');
rejects(fn() => DeliveryModel::assignPersonnel($manager,$delivery,$driver,'2099-01-01T10:00','2099-01-01T11:00',0),409);
$db->exec(file_get_contents(__DIR__ . '/../../schema/extensions/week4_delivery_personnel_assignment.sql'));
check(DeliveryModel::listing(1,1,10)['assignment_supported'], 'extension detected');
$start = '2090-01-02T10:00'; $end = '2090-01-02T11:00';
$available = DeliveryModel::availablePersonnel($manager,$delivery,$start,$end)['items'];
check(array_column($available,'user_id') === [$driver,$other], 'only area-active available licensed personnel');
$result = DeliveryModel::assignPersonnel($manager,$delivery,$driver,$start,$end,0);
check($result['changed'] && $result['delivery']['status'] === 'pending' && (int)$result['delivery']['assignment_version'] === 1, 'personnel only stays pending');
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn() === 1, 'assignment notification persisted');
check((int)$db->query('SELECT COUNT(*) FROM delivery_actions')->fetchColumn() === 1, 'assignment audited');
check(!DeliveryModel::assignPersonnel($manager,$delivery,$driver,$start,$end,1)['changed'], 'idempotent current version');
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn() === 1, 'no duplicate notification');
rejects(fn() => DeliveryModel::assignPersonnel($manager,$delivery,$driver,$start,$end,0),409);
rejects(fn() => DeliveryModel::assignPersonnel($manager,$second,$driver,'2090-01-02T10:30','2090-01-02T12:00',0),409);
rejects(fn() => DeliveryModel::assignPersonnel($manager,$second,$driver,'2090-01-02T09:00','2090-01-02T12:00',0),409);
rejects(fn() => DeliveryModel::assignPersonnel($manager,$second,$driver,'2090-01-02T10:15','2090-01-02T10:45',0),409);
check(count(DeliveryModel::availablePersonnel($manager,$second,$start,$end)['items']) === 1, 'reserved pending driver excluded');
DeliveryModel::assignPersonnel($manager,$second,$driver,$end,'2090-01-02T12:00',0);
check(true, 'adjacent nonoverlapping interval allowed');
DeliveryModel::assignPersonnel($manager,$delivery,$other,$start,$end,1);
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn() === 4, 'old and new notified on reassignment');
DeliveryModel::assignPersonnel($manager,$delivery,$other,'2090-01-02T09:00',$end,2);
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn() === 5, 'reschedule notifies once');
foreach (['driver_foreign'=>404,'driver_busy'=>409,'driver_expired'=>409,'driver_suspended'=>409] as $key=>$status) rejects(fn()=>DeliveryModel::assignPersonnel($manager,$second,$ids[$key],$start,$end,1),$status);
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$foreign,$driver,$start,$end,0),404);
rejects(fn()=>DeliveryModel::availablePersonnel($manager,$foreign,$start,$end),404);
foreach ([['2020-01-01T10:00',$end],[$end,$start],['2090-02-30T10:00',$end],[$start,'2090-01-02T10:00'],['2090-01-02T10:00Z',$end]] as [$a,$b]) rejects(fn()=>DeliveryModel::scheduleWindow($a,$b),422);
$cancelled = DeliveryModel::cancel($manager,$delivery,3,'Synthetic weather cancellation');
check($cancelled['delivery']['status'] === 'cancelled' && (int)$cancelled['delivery']['delivery_personnel_id'] === $other, 'cancellation retains resource history');
check(!DeliveryModel::cancel($manager,$delivery,4,'Repeated cancellation')['changed'], 'idempotent cancellation');
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$delivery,$driver,$start,$end,4),409);
rejects(fn()=>DeliveryModel::cancel($manager,$second,0,'Stale'),409);
rejects(fn()=>DeliveryModel::cancel($manager,$second,1,''),422);
foreach (['in_transit','delivered','cancelled'] as $status) {
    $terminal = week4Delivery($manager,1,$status);
    rejects(fn()=>DeliveryModel::assignPersonnel($manager,$terminal,$driver,$start,$end,0),409);
    if ($status !== 'cancelled') rejects(fn()=>DeliveryModel::cancel($manager,$terminal,0,'Not editable'),409);
}
$legacy = week4Delivery($manager,1,'assigned');
DeliveryModel::assignPersonnel($manager,$legacy,$other,'2090-02-01T10:00','2090-02-01T11:00',0);
check($db->query('SELECT status FROM deliveries WHERE delivery_id='.$legacy)->fetchColumn() === 'pending', 'legacy assigned requires vehicle revalidation');
$unknown = week4Delivery($manager); $db->exec('UPDATE deliveries SET delivery_personnel_id='.$other.' WHERE delivery_id='.$unknown);
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$second,$other,'2090-03-01T10:00','2090-03-01T11:00',1),409);
$db->exec("UPDATE deliveries SET status='cancelled' WHERE delivery_id=$unknown");
$transit = week4Delivery($manager,1,'in_transit');
$db->exec("UPDATE deliveries SET delivery_personnel_id=$other,scheduled_at='2080-01-01 10:00:00',scheduled_end_at='2080-01-01 11:00:00' WHERE delivery_id=$transit");
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$second,$other,'2090-03-01T10:00','2090-03-01T11:00',1),409);
$db->exec("UPDATE deliveries SET status='delivered' WHERE delivery_id=$transit");
// The licence must cover every instant of the half-open reservation interval.
$licenceCase=week4Delivery($manager);
$db->exec("UPDATE delivery_personnel SET license_expiry='2090-01-01' WHERE user_id=$other");
DeliveryModel::assignPersonnel($manager,$licenceCase,$other,'2090-01-01T23:00','2090-01-02T00:00',0);
check(true,'licence valid through midnight exclusive end');
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$licenceCase,$other,'2090-01-01T23:00','2090-01-02T00:01',1),409);
$db->exec("UPDATE delivery_personnel SET license_expiry='2099-12-31',availability_status='unavailable' WHERE user_id=$other");
rejects(fn()=>DeliveryModel::assignPersonnel($manager,$licenceCase,$other,'2090-02-02T10:00','2090-02-02T11:00',1),409);
$db->exec("UPDATE delivery_personnel SET availability_status='available' WHERE user_id=$other");
try { $db->exec("UPDATE deliveries SET scheduled_end_at='2089-01-01 00:00:00' WHERE delivery_id=$licenceCase"); throw new LogicException('Missing schedule constraint'); }
catch(PDOException $e) { check((int)($e->errorInfo[1]??0)===4025,'database rejects inverted schedule'); }
// Notification persistence failure must roll back both reservation and audit.
$rollback = week4Delivery($manager); $auditBefore = (int)$db->query('SELECT COUNT(*) FROM delivery_actions')->fetchColumn();
$db->exec("CREATE TRIGGER week4_fail_notification BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic notification failure'");
try { DeliveryModel::assignPersonnel($manager,$rollback,$other,$start,$end,0); throw new LogicException('Expected persistence failure'); } catch (RuntimeException $e) { check(!$db->inTransaction(), 'failed notification rolled back transaction'); }
$db->exec('DROP TRIGGER week4_fail_notification');
check($db->query('SELECT delivery_personnel_id FROM deliveries WHERE delivery_id='.$rollback)->fetchColumn() === null, 'failed notification rolls back driver');
check((int)$db->query('SELECT COUNT(*) FROM delivery_actions')->fetchColumn() === $auditBefore, 'failed notification rolls back audit');
// Nested caller transaction remains caller-owned and can be rolled back.
$db->beginTransaction(); DeliveryModel::assignPersonnel($manager,$rollback,$other,$start,$end,0); check($db->inTransaction(),'nested transaction retained'); $db->rollBack();
check($db->query('SELECT delivery_personnel_id FROM deliveries WHERE delivery_id='.$rollback)->fetchColumn() === null,'caller rollback works');
$_SESSION = ['user_id'=>$manager,'role'=>'area_manager'];
Router::$body = ['delivery_personnel_id'=>$driver,'scheduled_at'=>$start,'scheduled_end_at'=>$end,'expected_version'=>0];
foreach ([false, [], 1.5, '1e2', '-1', '999999999999999999999'] as $invalid) { Router::$body['delivery_personnel_id']=$invalid; controller('assign',['id'=>$rollback],422); }
Router::$body['delivery_personnel_id']=$driver; Router::$body['area_id']=2; controller('assign',['id'=>$rollback],422); unset(Router::$body['area_id']);
unset(Router::$body['expected_version']); controller('assign',['id'=>$rollback],422);
foreach ([false, [], 1.5, -1] as $invalid) { Router::$body['expected_version']=$invalid; controller('assign',['id'=>$rollback],422); }
Router::$body=['expected_version'=>0,'reason'=>['invalid']]; controller('cancel',['id'=>$rollback],422);
Router::$body=['expected_version'=>0,'reason'=>'Synthetic','status'=>'delivered']; controller('cancel',['id'=>$rollback],422);
foreach (['customer','admin','delivery_personnel','renting_party','freelance_worker','maintenance_tech'] as $role) {
    $_SESSION=['user_id'=>$ids[$role],'role'=>$role]; foreach (['assign','cancel','availablePersonnel'] as $method) controller($method,['id'=>$rollback],403);
}
$_SESSION=[]; foreach (['assign','cancel','availablePersonnel'] as $method) controller($method,['id'=>$rollback],401);
$_SESSION=['user_id'=>$manager,'role'=>'admin']; controller('assign',['id'=>$rollback],401); check($_SESSION===[],'forged cached role clears session');
$_SESSION=['user_id'=>$manager,'role'=>'area_manager']; $db->exec("UPDATE users SET account_status='suspended' WHERE user_id=$manager"); controller('assign',['id'=>$rollback],403); $db->exec("UPDATE users SET account_status='active' WHERE user_id=$manager");
$_SESSION=['user_id'=>$manager,'role'=>'area_manager']; $db->exec('UPDATE areas SET is_active=0 WHERE area_id=1'); controller('assign',['id'=>$rollback],409); $db->exec('UPDATE areas SET is_active=1 WHERE area_id=1');
// Fresh records for actual HTTP, concurrency and manual browser tests.
$fixture['http_delivery'] = week4Delivery($manager);
$fixture['races'] = [];
for ($i=0;$i<8;$i++) $fixture['races'][] = week4Delivery($manager);
$fixture['manual_deliveries'] = [];
for ($i=0;$i<14;$i++) $fixture['manual_deliveries'][] = week4Delivery($manager);
$fixture['http_port'] = 18086; $fixture['mysql_port'] = 13307;
if (!is_dir(__DIR__.'/../../tmp')) mkdir(__DIR__.'/../../tmp',0700,true);
file_put_contents(__DIR__.'/../../tmp/week4-fixture.json', json_encode($fixture,JSON_PRETTY_PRINT));
echo "PASS: $checks Week 4 backend/security checks; TEST_DATABASE=" . $fixture['database'] . "\n";
