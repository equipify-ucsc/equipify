<?php
declare(strict_types=1);
require __DIR__ . '/admin_users_test.php';
$baseline = $checks;
$sessions = realpath(__DIR__ . '/../../tmp/admin-users-sessions');
securityCheck($sessions !== false && is_writable($sessions) && str_starts_with($sessions, realpath(__DIR__ . '/../..') . DIRECTORY_SEPARATOR), 'Workspace session directory writable');
securityCheck(count(glob($sessions . '/sess_*')) > 0, 'Session files persisted');
$setStatus->execute(['active', $accounts['admin']['user_id']]);
$admin = securityLogin($accounts['admin']);
$r = securityRequest($admin, 'GET', '/backend/api/auth/me');
securityCheck($r['status'] === 200 && json_decode($r['bytes'], true) !== null && !str_contains($r['bytes'], 'Warning'), 'Session retained and warning-free JSON');
$login = securityRequest(securityClient(), 'POST', '/backend/api/auth/login', ['email'=>$accounts['admin']['email'], 'password'=>$accounts['admin']['password'], 'portal'=>'admin']);
securityCheck($login['status']===200 && json_decode($login['bytes'], true, 512, JSON_THROW_ON_ERROR)['data']['role']==='admin' && !str_contains($login['bytes'], 'Warning'), 'Login is valid warning-free JSON');
$paths = [['GET','/backend/api/admin/users'], ['POST',"/backend/api/admin/users/$target/suspend"], ['POST',"/backend/api/admin/users/$target/ban"]];
foreach ($paths as [$method,$path]) securityCheck(securityRequest(securityClient(),$method,$path,['reason'=>'Synthetic'])['status']===401, 'Anonymous endpoint denied');
foreach (['renting_party','freelance_worker','maintenance_tech','delivery_personnel','area_manager'] as $role) {
    $client = securityLogin($accounts[$role]);
    foreach ($paths as [$method,$path]) securityCheck(securityRequest($client,$method,$path,['reason'=>'Synthetic'])['status']===403, 'Non-Admin endpoint denied: '.$role);
}
foreach (['suspended','banned'] as $status) foreach ($paths as [$method,$path]) {
    $setStatus->execute(['active',$accounts['admin']['user_id']]);
    $client=securityLogin($accounts['admin']);
    $setStatus->execute([$status,$accounts['admin']['user_id']]);
    securityCheck(securityRequest($client,$method,$path,['reason'=>'Synthetic'])['status']===403,'Inactive Admin endpoint denied');
}
$setStatus->execute(['active',$accounts['admin']['user_id']]);
$admin=securityLogin($accounts['admin']);
$read=$db->prepare('SELECT account_status,status_reason,status_changed_by,status_changed_at FROM users WHERE user_id=?');
$read->execute([$target]); $before=$read->fetch();
securityCheck($before['account_status']==='banned' && $before['status_reason']==='Synthetic ban' && (int)$before['status_changed_by']===$accounts['admin']['user_id'] && $before['status_changed_at']!==null,'Database ban and audit persisted');
$r=securityRequest($admin,'POST',"/backend/api/admin/users/$target/ban",['reason'=>'Repeat ban']);
$read->execute([$target]); securityCheck($r['status']===200 && $read->fetch()===$before,'Repeated ban preserves database audit');
foreach (['', '   ',str_repeat('x',256), [],null,42] as $reason) foreach (['ban','suspend'] as $action) securityCheck(securityRequest($admin,'POST',"/backend/api/admin/users/$target/$action",['reason'=>$reason])['status']===422,'Invalid reason rejected');
foreach (['0','-1','abc','9223372036854775807'] as $id) securityCheck(in_array(securityRequest($admin,'POST',"/backend/api/admin/users/$id/ban",['reason'=>'Synthetic'])['status'],[404,422],true),'Invalid or missing target');
foreach (['admin','area_manager'] as $role) foreach (['ban','suspend'] as $action) securityCheck(securityRequest($admin,'POST','/backend/api/admin/users/'.$accounts[$role]['user_id'].'/'.$action,['reason'=>'Synthetic'])['status']===403,'Protected role rejected');
foreach (['renting_party','freelance_worker','maintenance_tech','delivery_personnel'] as $role) {
    $id=$accounts[$role]['user_id'];
    $client=securityLogin($accounts[$role]);
    $r=securityRequest($admin,'POST',"/backend/api/admin/users/$id/suspend",['reason'=>'Synthetic persistence '.$role]);
    securityCheck($r['status']===200,'Operational suspension '.$role);
    $read->execute([$id]); $stored=$read->fetch();
    securityCheck($stored['account_status']==='suspended' && (int)$stored['status_changed_by']===$accounts['admin']['user_id'],'Database suspension persisted '.$role);
    securityCheck(securityRequest($client,'GET','/backend/api/complaints')['status']===403,'Existing session denied '.$role);
}
$r=securityRequest($admin,'GET','/backend/api/admin/users');
securityCheck($r['status']===200,'User listing successful');
foreach ($r['body']['data'] as $user) if (!in_array($user['role'],UserModel::OPERATIONAL_ROLES,true)) throw new RuntimeException('Unexpected privileged role in listing');
securityCheck(true,'Listing contains operational roles only');
$read->execute([$target]); securityCheck($read->fetch()===$before,'Rejected actions leave banned audit unchanged');
$listed=array_column($r['body']['data'],null,'user_id');
securityCheck($listed[$target]['account_status']==='banned','Fresh HTTP read sees persisted ban');
echo 'PASS: '.($checks-$baseline)." additional HTTP/session/database assertions.\n";
echo "FINAL: passed=$checks failed=0 blocked=0\n";
