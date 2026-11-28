<?php
declare(strict_types=1);
require_once __DIR__.'/week4_fixture.php';week4Safety();
$fixture=json_decode(file_get_contents(__DIR__.'/../../tmp/week4-fixture.json'),true,512,JSON_THROW_ON_ERROR);
$name=$fixture['database'];if(!preg_match('/\Aequipify_week4_test_[a-z0-9_]+\z/',$name))throw new RuntimeException('Isolated fixture required.');
putenv('EQUIPIFY_DB_NAME='.$name);
require_once __DIR__.'/../models/DeliveryModel.php';require_once __DIR__.'/../models/VehicleModel.php';
$db=getDbConnection();if($db->query('SELECT DATABASE()')->fetchColumn()!==$name)throw new RuntimeException('Isolation failed.');
$i=$fixture['ids'];$v=$fixture['vehicles'];$m=$i['area_manager'];$p=$i['delivery_personnel'];$q=$i['driver_two'];$checks=0;
function check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;}
function rejects(callable $action,int $status):void{try{$action();}catch(DomainException $e){check($e->getCode()===$status,'rejected '.$status);return;}throw new RuntimeException('Expected rejection');}
function vehicleState(int $id):string{$s=getDbConnection()->prepare('SELECT status FROM vehicles WHERE vehicle_id=?');$s->execute([$id]);return $s->fetchColumn();}
$d=week4Delivery($m);$b=week4Delivery($m);$start='2095-01-01T10:00';$end='2095-01-01T11:00';
check(array_column(DeliveryModel::availableVehicles($m,$d,$start,$end)['items'],'vehicle_id')===[$v['first'],$v['peer']],'only eligible area vehicles; peer fleet shared');
foreach(['foreign'=>404,'maintenance'=>409,'retired'=>409,'orphan'=>409]as$key=>$status)rejects(fn()=>DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,0,$v[$key]),$status);
check($db->query('SELECT delivery_personnel_id FROM deliveries WHERE delivery_id='.$d)->fetchColumn()===null,'failed vehicle leaves personnel untouched');
$saved=DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,0,$v['first']);
check($saved['delivery']['status']==='assigned' && vehicleState($v['first'])==='in_use','both resources assigned atomically');
check(!DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,1,$v['first'])['changed'],'combined assignment idempotent');
$db->exec("UPDATE vehicles SET status='available' WHERE vehicle_id=".$v['first']);
check(!DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,1,$v['first'])['changed']&&vehicleState($v['first'])==='in_use','idempotent confirmation repairs a stale vehicle flag without duplicate events');
rejects(fn()=>DeliveryModel::assignPersonnel($m,$b,$q,$start,$end,0,$v['first']),409);
rejects(fn()=>DeliveryModel::assignPersonnel($m,$b,$q,'2095-01-01T09:00','2095-01-01T12:00',0,$v['first']),409);
check(count(DeliveryModel::availableVehicles($m,$b,$start,$end)['items'])===1,'overlap hidden in availability');
DeliveryModel::assignPersonnel($m,$b,$q,$end,'2095-01-01T12:00',0,$v['first']);check(true,'same vehicle adjacent booking allowed despite in_use');
DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,1,$v['peer']);
check(vehicleState($v['first'])==='in_use'&&vehicleState($v['peer'])==='in_use','reassignment retains old vehicle for other booking');
DeliveryModel::cancel($m,$b,1,'Synthetic release');check(vehicleState($v['first'])==='available','last cancellation releases vehicle');
DeliveryModel::assignPersonnel($m,$d,$p,'2095-01-02T10:00','2095-01-02T11:00',2,$v['peer']);check(true,'both resources rescheduled');
DeliveryModel::assignPersonnel($m,$d,$p,'2095-01-02T10:00','2095-01-02T11:00',3,null);
check(vehicleState($v['peer'])==='available'&&$db->query('SELECT status FROM deliveries WHERE delivery_id='.$d)->fetchColumn()==='pending','personnel-only releases vehicle and returns pending');
DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,4,$v['first']);
rejects(fn()=>VehicleModel::retire($v['first'],$m),409);
$row=VehicleModel::findForManager($v['first'],$m);rejects(fn()=>VehicleModel::update($v['first'],$m,$row),409);
$count=(int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn();
$db->exec("CREATE TRIGGER week4_vehicle_fail BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic failure'");
try{DeliveryModel::assignPersonnel($m,$d,$p,$start,$end,5,$v['peer']);throw new LogicException('Expected failure');}catch(RuntimeException $e){check(!$db->inTransaction(),'notification error rolls back transaction');}
$db->exec('DROP TRIGGER week4_vehicle_fail');
check(vehicleState($v['first'])==='in_use'&&vehicleState($v['peer'])==='available','rollback restores both vehicle states');
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn()===$count,'failed update creates no notification');
rejects(fn()=>DeliveryModel::transition($m,$d,5,'in_transit'),409);
rejects(fn()=>DeliveryModel::transition($m,$d,5,'delivered'),409);
rejects(fn()=>DeliveryModel::transition($m,$d,5,'assigned'),422);
rejects(fn()=>DeliveryModel::transition($i['manager_foreign'],$d,5,'in_transit'),404);
// Only synthetic fixture times are adjusted to exercise physical delivery progress.
$db->exec("UPDATE deliveries SET scheduled_at=DATE_SUB(NOW(),INTERVAL 5 MINUTE),scheduled_end_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE delivery_id=$d");
$legacyDriver=week4Delivery($m);$db->exec("UPDATE deliveries SET delivery_personnel_id=$p WHERE delivery_id=$legacyDriver");
rejects(fn()=>DeliveryModel::transition($m,$d,5,'in_transit'),409);
$db->exec("UPDATE deliveries SET status='cancelled' WHERE delivery_id=$legacyDriver");
$db->exec("UPDATE vehicles SET status='maintenance' WHERE vehicle_id=".$v['first']);
rejects(fn()=>DeliveryModel::transition($m,$d,5,'in_transit'),409);
$db->exec("UPDATE vehicles SET status='in_use' WHERE vehicle_id=".$v['first']);
$db->exec("UPDATE users SET account_status='suspended' WHERE user_id=$p");
rejects(fn()=>DeliveryModel::transition($m,$d,5,'in_transit'),409);
$db->exec("UPDATE users SET account_status='active' WHERE user_id=$p");
$db->exec("CREATE TRIGGER week4_start_fail BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic start failure'");
try{DeliveryModel::transition($m,$d,5,'in_transit');throw new LogicException('Expected notification failure');}catch(RuntimeException $e){check(!$db->inTransaction(),'start failure rolls back transaction');}
$db->exec('DROP TRIGGER week4_start_fail');
check($db->query('SELECT status FROM deliveries WHERE delivery_id='.$d)->fetchColumn()==='assigned','failed start retains Assigned and version');
DeliveryModel::transition($m,$d,5,'in_transit');check(vehicleState($v['first'])==='in_use','start retains reservation');
check(!DeliveryModel::transition($m,$d,6,'in_transit')['changed'],'start idempotent with current version');
rejects(fn()=>DeliveryModel::cancel($m,$d,6,'No'),409);
rejects(fn()=>DeliveryModel::assignPersonnel($m,week4Delivery($m),$q,'2095-02-01T10:00','2095-02-01T11:00',0,$v['first']),409);
$db->exec("UPDATE deliveries SET scheduled_at=DATE_SUB(NOW(),INTERVAL 2 HOUR),scheduled_end_at=DATE_SUB(NOW(),INTERVAL 1 HOUR) WHERE delivery_id=$d");
check(count(DeliveryModel::availableVehicles($m,week4Delivery($m),$start,$end)['items'])===1,'overdue in-transit blocks vehicle');
DeliveryModel::transition($m,$d,6,'delivered');check(vehicleState($v['first'])==='available','completion releases last reservation');
check(!DeliveryModel::transition($m,$d,7,'delivered')['changed'],'completion idempotent');
rejects(fn()=>DeliveryModel::transition($m,$d,6,'delivered'),409);
// Unknown legacy window blocks vehicle until explicitly cancelled.
$legacy=week4Delivery($m);$db->exec('UPDATE deliveries SET vehicle_id='.$v['first'].' WHERE delivery_id='.$legacy);
rejects(fn()=>DeliveryModel::assignPersonnel($m,week4Delivery($m),$q,$start,$end,0,$v['first']),409);
DeliveryModel::cancel($m,$legacy,0,'Synthetic legacy resolution');check(vehicleState($v['first'])==='available','legacy cancellation releases unresolved hold');
// Fixture rows dedicated to concurrent vehicle tests and live-browser lifecycle checks.
$fixture['vehicle_lifecycle']=week4Delivery($m);
DeliveryModel::assignPersonnel($m,$fixture['vehicle_lifecycle'],$p,'2031-01-01T10:00','2031-01-01T11:00',0,$v['peer']);
$db->exec('UPDATE deliveries SET scheduled_at=DATE_SUB(NOW(),INTERVAL 5 MINUTE),scheduled_end_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE delivery_id='.$fixture['vehicle_lifecycle']);
$fixture['vehicle_races']=[];for($n=0;$n<10;$n++)$fixture['vehicle_races'][]=week4Delivery($m);
$fixture['vehicle_http']=week4Delivery($m);$fixture['vehicle_browser']=week4Delivery($m);
file_put_contents(__DIR__.'/../../tmp/week4-fixture.json',json_encode($fixture,JSON_PRETTY_PRINT));
echo "PASS: $checks Week 4 vehicle backend/lifecycle/security checks.\n";
