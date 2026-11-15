<?php
/** CLI HTTP tests; only a guarded, explicitly selected isolated area database. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
$name=$argv[1]??'';
if(!preg_match('/\Aequipify_areas_test_[a-z0-9_]+\z/',$name)) throw new RuntimeException('Isolated area database required.');
$base=$argv[2]??'http://127.0.0.1:18085';
if(!preg_match('#\Ahttp://127\.0\.0\.1:[0-9]+\z#',$base)) throw new RuntimeException('Loopback URL required.');
putenv('EQUIPIFY_DB_NAME='.$name);
require __DIR__.'/../models/UserModel.php';
$checks=0;
function check(bool $ok,string $label):void {global $checks;if(!$ok)throw new RuntimeException('FAILED: '.$label);$checks++;}
function client(){ $c=curl_init();curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>10]);return $c; }
function request($c,string $method,string $path,array $body=[]):array{
 global $base,$name;
 $marker='';curl_setopt_array($c,[CURLOPT_URL=>$base.$path,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_HEADERFUNCTION=>static function($c,$line)use(&$marker){if(stripos($line,'X-Equipify-Test-Database:')===0)$marker=trim(explode(':',$line,2)[1]);return strlen($line);}]);
 if($method!=='GET')curl_setopt($c,CURLOPT_POSTFIELDS,json_encode($body));
 $raw=curl_exec($c);if($marker!==$name)throw new RuntimeException('Isolation marker mismatch.');
 return [curl_getinfo($c,CURLINFO_RESPONSE_CODE),json_decode($raw,true)];
}
request(client(),'GET','/frontend/shared/api.js');
$db=getDbConnection();check($db->query('SELECT DATABASE()')->fetchColumn()===$name,'Database isolation');
$password=bin2hex(random_bytes(16));$email='area-auth-'.bin2hex(random_bytes(8)).'@qa.invalid';
$id=UserModel::insert(['email'=>$email,'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'role'=>'admin','full_name'=>'Synthetic area auth','phone'=>'+9476'.random_int(1000000,9999999),'address_line'=>null,'district'=>'Colombo']);
$db->prepare('INSERT INTO admins(user_id) VALUES(?)')->execute([$id]);
function login(){global $email,$password;$c=client();check(request($c,'POST','/backend/api/auth/login',['email'=>$email,'password'=>$password,'portal'=>'admin'])[0]===200,'Active Admin login');return $c;}
function fingerprint():string{global $db;return hash('sha256',serialize([$db->query('SELECT * FROM areas ORDER BY area_id')->fetchAll(),$db->query('SELECT * FROM area_managers ORDER BY user_id')->fetchAll()]));}
$routes=[['GET','/admin/areas'],['POST','/admin/areas'],['PUT','/admin/areas/1'],['POST','/admin/areas/1/activate'],['POST','/admin/areas/1/deactivate'],['GET','/admin/area-managers'],['POST','/admin/area-managers'],['PUT','/admin/area-managers/1/area']];
$state=$db->prepare('UPDATE users SET account_status=?,role=? WHERE user_id=?');
foreach($routes as [$method,$path]){
 check(request(client(),$method,'/backend/api'.$path)[0]===401,'Anonymous denied');
 foreach(['suspended','banned','deactivated','role_changed'] as $status){
  $state->execute(['active','admin',$id]);$c=login();
  $state->execute([$status==='role_changed'?'active':$status,$status==='role_changed'?'customer':'admin',$id]);
  $before=fingerprint();
  check(request($c,$method,'/backend/api'.$path,['name'=>'Must not persist','area_id'=>null])[0]===($status==='role_changed'?401:403),'Stale session denied '.$path.' '.$status);
  check(fingerprint()===$before,'Denied request changes no area or assignment');
  $state->execute(['active','admin',$id]);
  check(request($c,'GET','/backend/api/admin/areas')[0]===401,'Restoring account cannot revive rejected session');
  curl_close($c);
 }
}
$state->execute(['active','admin',$id]);$c=login();
check(request($c,'GET','/backend/api/admin/areas')[0]===200,'Active Admin area listing');
check(request($c,'GET','/backend/api/admin/area-managers')[0]===200,'Active Admin manager listing');
echo "PASS: $checks area Admin live-account/session security assertions.\n";
