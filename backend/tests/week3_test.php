<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
if (in_array(strtolower((string) getenv('EQUIPIFY_ENV')), ['prod', 'production'], true)
    || in_array(strtolower((string) getenv('APP_ENV')), ['prod', 'production'], true)) {
 throw new RuntimeException('Week 3 fixtures are disabled in production.');
}
require_once __DIR__ . '/../config/db_config.php';
require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/ListQuery.php';
require_once __DIR__ . '/../services/NotificationService.php';
require_once __DIR__ . '/../services/Mailer.php';
require_once __DIR__ . '/../services/EmailTemplates.php';
require_once __DIR__ . '/../controllers/NotificationController.php';
require_once __DIR__ . '/../controllers/DeliveryController.php';
require_once __DIR__ . '/../controllers/FreelanceWorkerMockController.php';
final class Captured extends RuntimeException { public $data; public function __construct($data, int $status) { parent::__construct('', $status); $this->data = $data; } }
final class Response {
 public static function ok($data = null, int $status = 200): void { throw new Captured($data, $status); }
 public static function error(string $msg, int $status = 400, array $fields = []): void { throw new Captured($msg, $status); }
}
final class Router { public static array $body = []; public static function jsonBody(): array { return self::$body; } }
$checks = 0;
function check(bool $ok, string $label): void { global $checks; if (!$ok) throw new RuntimeException('FAIL: '.$label); $checks++; }
function callController(callable $fn, int $status = 200) { try { $fn(); } catch (Captured $r) { check($r->getCode() === $status, 'response status '.$status); return $r->data; } throw new RuntimeException('Missing response'); }
$name = 'equipify_week3_test_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4));
$port = (int) (getenv('EQUIPIFY_DB_PORT') ?: DB_PORT);
$server = new PDO('mysql:host=127.0.0.1;port='.$port.';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
putenv('EQUIPIFY_DB_NAME='.$name); $db = getDbConnection();
check($db->query('SELECT DATABASE()')->fetchColumn() === $name && $name !== 'equipify', 'isolated database');
foreach (glob(__DIR__.'/../../schema/[0-9][0-9][0-9]_*.sql') as $file) if (substr(basename($file),0,3) !== '000') $db->exec(file_get_contents($file));
$ids = []; $i=0;
foreach (['customer','renting_party','freelance_worker','delivery_personnel','maintenance_tech','area_manager','admin'] as $role) {
 $stmt=$db->prepare('INSERT INTO users (email,password_hash,role,full_name,phone) VALUES (?,?,?,?,?)');
 $stmt->execute([$role.'@week3.test',password_hash('Week3-Test-Only!42', PASSWORD_DEFAULT),$role,'Week 3 '.$role,'077770000'.++$i]); $ids[$role]=(int)$db->lastInsertId();
}
foreach ($ids as $role=>$id) {
 $_SESSION=['user_id'=>$id,'role'=>$role]; $_GET=[];
 check(callController([NotificationController::class,'index'])['items'] === [], 'empty '.$role);
 $first=NotificationService::notify($id,'test','First','Synthetic'); $second=NotificationService::notify($id,'test','Second','Synthetic');
 $rows=callController([NotificationController::class,'index']); check(count($rows['items'])===2 && (int)$rows['items'][0]['notification_id']===$second['notification_id'], 'ordering '.$role);
 check(callController([NotificationController::class,'unreadCount'])['count']===2,'count '.$role);
 Router::$body=['notification_id'=>$first['notification_id']]; check(callController([NotificationController::class,'markRead'])['marked']===1,'mark '.$role);
 check(callController([NotificationController::class,'unreadCount'])['count']===1,'read persists '.$role);
 $_GET=['page'=>-4,'per_page'=>9999]; check(callController([NotificationController::class,'index'])['per_page']===50,'pagination '.$role);
 Router::$body=['notification_id'=>-1]; callController([NotificationController::class,'markRead'],422);
}
$_GET=[];
$_SESSION=['user_id'=>$ids['freelance_worker'],'role'=>'freelance_worker'];
check(isset(callController([FreelanceWorkerMockController::class,'dashboard'])['stats']['unread_notifications']), 'active freelancer dashboard');
$db->exec("UPDATE users SET account_status='suspended' WHERE user_id=".$ids['freelance_worker']);
callController([FreelanceWorkerMockController::class,'dashboard'],403);
check($_SESSION===[], 'suspended dashboard clears identity');
$db->exec("UPDATE users SET account_status='active' WHERE user_id=".$ids['freelance_worker']);
$_SESSION=['user_id'=>$ids['freelance_worker'],'role'=>'admin'];
callController([FreelanceWorkerMockController::class,'dashboard'],401);
$_SESSION=['user_id'=>$ids['customer'],'role'=>'customer'];
callController([FreelanceWorkerMockController::class,'dashboard'],403);
$_SESSION=[]; callController([FreelanceWorkerMockController::class,'dashboard'],401);
callController([NotificationController::class,'index'],401); callController([NotificationController::class,'unreadCount'],401);
$_SESSION=['user_id'=>$ids['customer'],'role'=>'admin']; callController([NotificationController::class,'index'],401);
$_SESSION=['user_id'=>$ids['customer'],'role'=>'customer']; Router::$body=['notification_id'=>$second['notification_id']]; check(callController([NotificationController::class,'markRead'])['marked']===0,'cross recipient');
$db->exec('INSERT INTO admins(user_id) VALUES ('.$ids['admin'].')');
$db->exec("INSERT INTO areas(name) VALUES ('Week3 A'),('Week3 B')");
$db->exec('INSERT INTO area_managers(user_id,registered_by,area_id) VALUES ('.$ids['area_manager'].','.$ids['admin'].',1)');
$stmt=$db->prepare('INSERT INTO deliveries(area_id,assigned_by,related_reference,pickup_address,delivery_address) VALUES (?, ?, ?, ?, ?)');
foreach ([1,2] as $area) $stmt->execute([$area,$ids['area_manager'],'SAFE-'.$area,'Test pickup','Test dropoff']);
$_SESSION=['user_id'=>$ids['area_manager'],'role'=>'area_manager'];
$_GET=['area_id'=>2]; $rows=callController([DeliveryController::class,'index']); check($rows['total']===1 && $rows['items'][0]['related_reference']==='SAFE-1','area override ignored');
$_GET=['status'=>'bogus','page'=>-1,'per_page'=>-1]; check(callController([DeliveryController::class,'index'])['total']===1,'invalid filter conventions');
$_GET=['status'=>'delivered']; check(callController([DeliveryController::class,'index'])['total']===0,'empty delivery');
$db->exec('UPDATE area_managers SET area_id=2 WHERE user_id='.$ids['area_manager']); $_GET=[];
check(callController([DeliveryController::class,'index'])['items'][0]['related_reference']==='SAFE-2','other area hidden');
$db->exec('UPDATE area_managers SET area_id=NULL WHERE user_id='.$ids['area_manager']); callController([DeliveryController::class,'index'],409);
foreach (['customer','admin'] as $role) { $_SESSION=['user_id'=>$ids[$role],'role'=>$role]; callController([DeliveryController::class,'index'],403); }
$_SESSION=[]; callController([DeliveryController::class,'index'],401);
check(DeliveryModel::createFromRental(0)['status']==='invalid','invalid rental');
try { DeliveryModel::createFromRental(1); throw new RuntimeException('Should fail closed'); } catch (LogicException $e) { check(true,'missing rental fails closed'); }
putenv('EQUIPIFY_MAIL_FROM=sender@example.test'); putenv('EQUIPIFY_MAIL_TRANSPORT=file');
$dir=__DIR__.'/../../tmp/week3-mail-'.bin2hex(random_bytes(4)); putenv('EQUIPIFY_MAIL_DIRECTORY='.$dir);
foreach (['otp','rental_accepted','payment_due','deadline_missed'] as $type) {
 $t=EmailTemplates::render($type,['name'=>'<script>test</script>','otp'=>'731946','reference'=>'TEST-1']);
 check(strpos($t['html'],'<script>')===false && strpos($t['html'],'&lt;script&gt;')!==false,'escaping '.$type);
 check(Mailer::send('recipient@example.test',$t['subject'],$t['html']),'file '.$type);
}
check(count(glob($dir.'/*.eml'))===4,'four files');
putenv('EQUIPIFY_MAIL_TRANSPORT=sendmail'); putenv('EQUIPIFY_MAIL_ENABLE_SEND=0'); check(!Mailer::send('recipient@example.test','Test','No send'),'disabled SMTP');
check(!Mailer::send("bad\r\nBcc: victim@example.test",'Test','Body'),'header injection');
echo "PASS: $checks Week 3 checks; TEST_DATABASE=$name\n";
