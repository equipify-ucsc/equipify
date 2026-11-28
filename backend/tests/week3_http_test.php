<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
$name=$argv[1]??'';
if (!preg_match('/\Aequipify_week3_test_[a-z0-9_]+\z/',$name)) throw new RuntimeException('Explicit Week 3 test database required.');
$checks=0;
function req(string $path,int $status,?array $body=null,string $cookie=''): array {
 global $checks,$name;
 $ch=curl_init('http://127.0.0.1:18083'.$path); $headers=[];
 curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIE=>$cookie,CURLOPT_TIMEOUT=>10,
 CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_HEADERFUNCTION=>static function($c,$line) use (&$headers) { $headers[]=trim($line); return strlen($line); }]);
 if ($body!==null) curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body)]);
 $raw=curl_exec($ch);$actual=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
 if ($actual!==$status || !in_array('X-Equipify-Test-Database: '.$name,$headers,true)) throw new RuntimeException('HTTP failure '.$path.' status '.$actual);
 $checks++;return ['body'=>json_decode($raw,true),'headers'=>$headers];
}
req('/backend/api/notifications',401);req('/backend/api/notifications/unread-count',401);req('/backend/api/area-manager/deliveries',401);
req('/backend/api/freelancer/dashboard',401);
foreach (['customer','renting_party','freelance_worker','delivery_personnel','maintenance_tech','area_manager','admin'] as $role) {
 $login=req('/backend/api/auth/login',200,['email'=>$role.'@week3.test','password'=>'Week3-Test-Only!42','portal'=>$role]);$cookie='';
 foreach($login['headers'] as $h) if(preg_match('/^Set-Cookie: (PHPSESSID=[^;]+)/i',$h,$m))$cookie=$m[1];
 if(!$cookie)throw new RuntimeException('Missing cookie');
 req('/backend/api/notifications?user_id=9999&per_page=500',200,null,$cookie);
 req('/backend/api/notifications/unread-count',200,null,$cookie);
 req('/backend/api/notifications/read',422,['notification_id'=>0],$cookie);
 req('/backend/api/notifications/read',200,['all'=>true],$cookie);
 $count=req('/backend/api/notifications/unread-count',200,null,$cookie)['body']['data']['count'];
 if($count!==0)throw new RuntimeException('Read count not persisted');$checks++;
 req('/backend/api/area-manager/deliveries',$role==='area_manager'?409:403,null,$cookie);
 req('/backend/api/freelancer/dashboard',$role==='freelance_worker'?200:403,null,$cookie);
 if($role==='freelance_worker') {req('/backend/api/freelancer/notifications',200,null,$cookie);req('/backend/api/freelancer/notifications/read',200,['all'=>true],$cookie);}
 req('/backend/api/auth/logout',200,[],$cookie);req('/backend/api/notifications',401,null,$cookie);
}
// Mutations are confined to the explicitly verified isolated fixture database.
putenv('EQUIPIFY_DB_NAME='.$name);
require_once __DIR__ . '/../config/db_config.php';
$db=getDbConnection();
if ($db->query('SELECT DATABASE()')->fetchColumn()!==$name) throw new RuntimeException('Database isolation failed.');
$login=req('/backend/api/auth/login',200,['email'=>'freelance_worker@week3.test','password'=>'Week3-Test-Only!42','portal'=>'freelance_worker']);
foreach($login['headers'] as $h) if(preg_match('/^Set-Cookie: (PHPSESSID=[^;]+)/i',$h,$m))$cookie=$m[1];
$db->exec("UPDATE users SET account_status='suspended' WHERE email='freelance_worker@week3.test'");
try {
 $denied=req('/backend/api/freelancer/dashboard',403,null,$cookie);
 if (($denied['body']['success']??true)!==false || isset($denied['body']['data'])) throw new RuntimeException('Suspended dashboard returned data.');
 if (!in_array('X-Equipify-Identity: anonymous',$denied['headers'],true)) throw new RuntimeException('Revoked identity header missing.');
 $checks+=2;
 req('/backend/api/freelancer/dashboard',401,null,$cookie);
} finally { $db->exec("UPDATE users SET account_status='active' WHERE email='freelance_worker@week3.test'"); }
echo "PASS: $checks Week 3 HTTP checks\n";
