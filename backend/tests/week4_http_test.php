<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
require_once __DIR__ . '/week4_fixture.php';
week4Safety();
$name = $argv[1] ?? '';
if (!preg_match('/\Aequipify_week4_test_[a-z0-9_]+\z/', $name)) throw new RuntimeException('Explicit Week 4 database required.');
$fixture = json_decode(file_get_contents(__DIR__.'/../../tmp/week4-active.json'),true,512,JSON_THROW_ON_ERROR);
if ($fixture['database'] !== $name) throw new RuntimeException('Fixture mismatch.');
putenv('EQUIPIFY_DB_NAME='.$name); $db = getDbConnection();
if ($db->query('SELECT DATABASE()')->fetchColumn() !== $name) throw new RuntimeException('Isolation failed.');
$checks = 0;
function check(bool $ok,string $message): void { global $checks; if (!$ok) throw new RuntimeException('FAIL: '.$message); $checks++; }
function req(string $path,int $status,?array $body=null,string $cookie='',string $method='GET',?string $raw=null,string $type='application/json'): array {
    global $name;
    $headers=[]; $ch=curl_init('http://127.0.0.1:18086'.$path);
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIE=>$cookie,CURLOPT_TIMEOUT=>10,
        CURLOPT_CUSTOMREQUEST=>$body!==null?'POST':$method,CURLOPT_HTTPHEADER=>['Content-Type: '.$type],
        CURLOPT_HEADERFUNCTION=>static function($c,$line)use(&$headers){$headers[]=trim($line);return strlen($line);}]);
    if ($body!==null || $raw!==null) curl_setopt($ch,CURLOPT_POSTFIELDS,$raw??json_encode($body));
    $response=curl_exec($ch);$actual=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
    check($actual===$status,'HTTP '.$path.' status '.$actual.' expected '.$status);
    check(in_array('X-Equipify-Test-Database: '.$name,$headers,true),'verified isolated server');
    return ['body'=>json_decode($response,true),'headers'=>$headers,'raw'=>$response];
}
function login(string $role): string {
    $response=req('/backend/api/auth/login',200,['email'=>$role.'@week4.test','password'=>'Week4-Test-Only!42','portal'=>$role]);
    foreach($response['headers']as$header)if(preg_match('/^Set-Cookie: (PHPSESSID=[^;]+);/i',$header,$match)){
        check(stripos($header,'HttpOnly')!==false&&stripos($header,'SameSite=Lax')!==false,'secure session cookie conventions');return $match[1];
    }
    throw new RuntimeException('Missing session cookie');
}
$id=$fixture['http_delivery'];$base='/backend/api/area-manager/deliveries/'.$id;
foreach (['/assign','/cancel','/available-personnel'] as $suffix) req($base.$suffix,401,$suffix==='/available-personnel'?null:[]);
foreach(['customer','admin','renting_party','freelance_worker','maintenance_tech','delivery_personnel']as$role){
    $cookie=login($role);
    req('/backend/api/area-manager/deliveries',403,null,$cookie);
    req($base.'/assign',403,[],$cookie);req($base.'/cancel',403,[],$cookie);req($base.'/available-personnel',403,null,$cookie);
    req('/backend/api/auth/logout',200,[],$cookie);
}
$cookie=login('area_manager');
$rows=req('/backend/api/area-manager/deliveries?area_id=2&per_page=2&page=2',200,null,$cookie)['body']['data'];
check($rows['assignment_supported']===true&&count($rows['items'])===2&&$rows['page']===2,'listing pagination and extension metadata');
check($rows['total']===(int)$db->query('SELECT COUNT(*) FROM deliveries WHERE area_id=1')->fetchColumn(),'area override never selects foreign deliveries');
$query='?scheduled_at=2092-01-01T10%3A00&scheduled_end_at=2092-01-01T11%3A00';
$people=req($base.'/available-personnel'.$query,200,null,$cookie)['body']['data']['items'];
check(count($people)===2,'real available personnel retrieved');
check(!isset($people[0]['email'])&&!isset($people[0]['driving_license_no'])&&!isset($people[0]['password_hash']),'available list exposes only safe fields');
$body=['delivery_personnel_id'=>$fixture['ids']['delivery_personnel'],'scheduled_at'=>'2092-01-01T10:00','scheduled_end_at'=>'2092-01-01T11:00','expected_version'=>0];
req($base.'/assign',415,null,$cookie,'POST',json_encode($body),'application/x-www-form-urlencoded');
req($base.'/assign',400,null,$cookie,'POST','{broken');
req($base.'/assign',405,null,$cookie);
req($base.'/assign',422,$body+['area_id'=>2],$cookie);
req($base.'/assign',422,$body+['status'=>'assigned'],$cookie);
req($base.'/assign',422,$body+['vehicle_id'=>0],$cookie);
$invalid=$body;unset($invalid['expected_version']);req($base.'/assign',422,$invalid,$cookie);
$foreign=$db->query('SELECT delivery_id FROM deliveries WHERE area_id=2 LIMIT 1')->fetchColumn();
req('/backend/api/area-manager/deliveries/'.$foreign.'/assign',404,$body,$cookie);
req('/backend/api/area-manager/deliveries/'.$foreign.'/cancel',404,['expected_version'=>0,'reason'=>'Synthetic'],$cookie);
req('/backend/api/area-manager/deliveries/'.$foreign.'/available-personnel'.$query,404,null,$cookie);
req('/backend/api/area-manager/deliveries/1%20OR%201=1/assign',422,$body,$cookie);
$before=(int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn();
$saved=req($base.'/assign',200,$body,$cookie)['body']['data'];
check($saved['changed']&&$saved['delivery']['status']==='pending','real POST reserves but never fully assigns');
req($base.'/assign',409,$body,$cookie);
$body['expected_version']=1;
check(req($base.'/assign',200,$body,$cookie)['body']['data']['changed']===false,'HTTP idempotency');
$body['delivery_personnel_id']=$fixture['ids']['driver_two'];
req($base.'/assign',200,$body,$cookie);
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn()===$before+3,'atomic assignment and reassignment notifications');
$listing=req('/backend/api/area-manager/deliveries?status=pending',200,null,$cookie)['body']['data'];
check($listing['total']>0&&$listing['total_pages']>0,'pending list stays real and paginated');
req($base.'/cancel',422,['expected_version'=>2,'reason'=>''],$cookie);
req($base.'/cancel',200,['expected_version'=>2,'reason'=>'Synthetic HTTP cancellation'],$cookie);
req($base.'/assign',409,$body,$cookie);
req($base.'/cancel',200,['expected_version'=>3,'reason'=>'Repeat'],$cookie);
$driverCookie=login('delivery_personnel');
$notifications=req('/backend/api/notifications?type=delivery',200,null,$driverCookie)['body']['data'];
check(count($notifications['items'])>0,'assigned driver can read database notifications');
req('/backend/api/notifications/read',200,['all'=>true],$driverCookie);
check(req('/backend/api/notifications/unread-count',200,null,$driverCookie)['body']['data']['count']===0,'read persistence preserved');
req('/backend/api/auth/logout',200,[],$driverCookie);
$db->exec("UPDATE users SET account_status='suspended' WHERE user_id=".$fixture['ids']['area_manager']);
req($base.'/assign',403,$body,$cookie);
$db->exec("UPDATE users SET account_status='active' WHERE user_id=".$fixture['ids']['area_manager']);
req($base.'/assign',401,$body,$cookie);
foreach(['/tmp/week4-active.json','/backend/tests/week4_fixture.php','/schema/extensions/week4_delivery_personnel_assignment.sql']as$path)req($path,403);
echo "PASS: $checks Week 4 HTTP/security checks.\n";
