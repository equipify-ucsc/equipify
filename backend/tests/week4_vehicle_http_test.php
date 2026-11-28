<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit;
require_once __DIR__.'/week4_fixture.php';week4Safety();
$name=$argv[1]??'';if(!preg_match('/\Aequipify_week4_test_[a-z0-9_]+\z/',$name))throw new RuntimeException('Explicit isolated database required.');
$f=json_decode(file_get_contents(__DIR__.'/../../tmp/week4-active.json'),true,512,JSON_THROW_ON_ERROR);
if($f['database']!==$name)throw new RuntimeException('Fixture mismatch.');putenv('EQUIPIFY_DB_NAME='.$name);$db=getDbConnection();
if($db->query('SELECT DATABASE()')->fetchColumn()!==$name)throw new RuntimeException('Isolation failed.');
$checks=0;
function check(bool $ok,string $label):void{global $checks;if(!$ok)throw new RuntimeException('FAIL: '.$label);$checks++;}
function request(string $path,int $status,?array $body=null,string $cookie=''):array{
    global $name;$headers=[];$c=curl_init('http://127.0.0.1:18086/backend/api'.$path);
    curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_COOKIE=>$cookie,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],
        CURLOPT_HEADERFUNCTION=>static function($c,$line)use(&$headers){$headers[]=trim($line);return strlen($line);}]);
    if($body!==null)curl_setopt_array($c,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body)]);
    $raw=curl_exec($c);$actual=curl_getinfo($c,CURLINFO_RESPONSE_CODE);curl_close($c);
    check($actual===$status,'HTTP '.$path.' expected '.$status.' received '.$actual);
    check(in_array('X-Equipify-Test-Database: '.$name,$headers,true),'actual isolated HTTP database');
    return ['data'=>json_decode($raw,true),'headers'=>$headers];
}
function login(string $role):string{
    $r=request('/auth/login',200,['email'=>$role.'@week4.test','password'=>'Week4-Test-Only!42','portal'=>$role]);
    foreach($r['headers']as$h)if(preg_match('/^Set-Cookie: (PHPSESSID=[^;]+)/i',$h,$m))return $m[1];throw new RuntimeException('Missing cookie');
}
$path='/area-manager/deliveries/'.$f['vehicle_http'];$query='?scheduled_at=2097-01-01T10%3A00&scheduled_end_at=2097-01-01T11%3A00';
request($path.'/available-vehicles'.$query,401);request($path.'/status',401,[]);
foreach(['customer','admin','delivery_personnel','renting_party','freelance_worker','maintenance_tech']as$role){$cookie=login($role);request($path.'/available-vehicles'.$query,403,null,$cookie);request($path.'/status',403,[],$cookie);request('/auth/logout',200,[],$cookie);}
$cookie=login('area_manager');
$fleet=request($path.'/available-vehicles'.$query,200,null,$cookie)['data']['data']['items'];
check(count($fleet)===2,'only eligible same-area fleet');check(!isset($fleet[0]['managed_by']),'no owner details exposed');
$body=['delivery_personnel_id'=>$f['ids']['delivery_personnel'],'scheduled_at'=>'2097-01-01T10:00','scheduled_end_at'=>'2097-01-01T11:00','expected_version'=>0,'vehicle_id'=>$f['vehicles']['first']];
foreach([false,[],1.5,-1,0,'1e1']as$invalid){$bad=$body;$bad['vehicle_id']=$invalid;request($path.'/assign',422,$bad,$cookie);}
foreach(['foreign'=>404,'maintenance'=>409,'retired'=>409,'orphan'=>409]as$key=>$code){$bad=$body;$bad['vehicle_id']=$f['vehicles'][$key];request($path.'/assign',$code,$bad,$cookie);}
$foreign=$db->query('SELECT delivery_id FROM deliveries WHERE area_id=2 LIMIT 1')->fetchColumn();
request('/area-manager/deliveries/'.$foreign.'/available-vehicles'.$query,404,null,$cookie);
request('/area-manager/deliveries/'.$foreign.'/status',404,['status'=>'in_transit','expected_version'=>0],$cookie);
request($path.'/status',422,['status'=>'assigned','expected_version'=>0],$cookie);
request($path.'/status',422,['status'=>'delivered','expected_version'=>false],$cookie);
request($path.'/status',422,['status'=>'delivered','expected_version'=>0,'area_id'=>2],$cookie);
$r=request($path.'/assign',200,$body,$cookie)['data']['data'];check($r['delivery']['status']==='assigned','HTTP combined assignment finalizes resources');
request($path.'/assign',409,$body,$cookie);$body['expected_version']=1;
check(!request($path.'/assign',200,$body,$cookie)['data']['data']['changed'],'HTTP combined idempotency');
request($path.'/status',409,['status'=>'in_transit','expected_version'=>1],$cookie);
request($path.'/status',409,['status'=>'delivered','expected_version'=>1],$cookie);
$body['vehicle_id']=$f['vehicles']['peer'];request($path.'/assign',200,$body,$cookie);
$rows=request('/area-manager/deliveries?status=assigned&per_page=50',200,null,$cookie)['data']['data']['items'];
$current=array_values(array_filter($rows,fn($r)=>(int)$r['delivery_id']===$f['vehicle_http']))[0];
check($current['vehicle_plate']==='W4-VAN-2','listing shows persisted vehicle plate');
request($path.'/cancel',200,['expected_version'=>2,'reason'=>'Synthetic vehicle HTTP cancellation'],$cookie);
request($path.'/status',409,['expected_version'=>3,'status'=>'in_transit'],$cookie);
check(in_array($f['vehicles']['peer'],array_column(request('/area-manager/deliveries/'.$f['vehicle_browser'].'/available-vehicles'.$query,200,null,$cookie)['data']['data']['items'],'vehicle_id'),true),'cancelled window released for other delivery');
$db->exec("UPDATE users SET account_status='suspended' WHERE user_id=".$f['ids']['area_manager']);
request($path.'/available-vehicles'.$query,403,null,$cookie);
$db->exec("UPDATE users SET account_status='active' WHERE user_id=".$f['ids']['area_manager']);request($path.'/status',401,[],$cookie);
echo "PASS: $checks Week 4 vehicle HTTP/security checks.\n";
