/* Real XAMPP sendmail -> loopback-only SMTP sink. Never sends Internet email. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
const root = path.resolve(__dirname, '../..');
const xampp = process.env.EQUIPIFY_TEST_XAMPP_ROOT || 'C:/xampp1';
const php = path.join(xampp, 'php/php.exe');
const powershell = process.env.SystemRoot + '/System32/WindowsPowerShell/v1.0/powershell.exe';
const profile = path.join(os.tmpdir(), 'equipify sendmail test ' + crypto.randomUUID());
const output = path.join(root, 'tmp', 'smtp-native-' + crypto.randomUUID());
const username = 'loopback@example.test', password = 'Loopback;=Pass"Only42';
let checks = 0, mode = 'accept', connections = 0;
const messages = [], sockets = new Set();
function check(value, message) { assert.ok(value, message); checks++; }
const server = net.createServer(socket => {
  connections++;
  sockets.add(socket); socket.on('close',()=>sockets.delete(socket));
  socket.on('error',()=>{});
  socket.setEncoding('utf8'); socket.write('220 loopback.test ESMTP fixture\r\n');
  let buffer = '', auth = '', data = false, lines = [];
  socket.on('data', chunk => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0,boundary); buffer = buffer.slice(boundary+2);
      if (data) {
        if (line !== '.') { lines.push(line.startsWith('..') ? line.slice(1) : line); continue; }
        data = false;
        if (mode === 'reject') socket.write('451 Synthetic rejection ' + password + '\r\n');
        else { messages.push(lines.join('\r\n')+'\r\n'); socket.write('250 Accepted by local test sink\r\n'); }
        lines = []; continue;
      }
      if (auth === 'username') {
        if (Buffer.from(line,'base64').toString('utf8') !== username) { socket.write('535 Wrong test username\r\n'); auth=''; }
        else { auth='password'; socket.write('334 UGFzc3dvcmQ6\r\n'); }
        continue;
      }
      if (auth === 'password') {
        auth='';
        const valid = Buffer.from(line,'base64').toString('utf8') === password;
        socket.write(valid ? '235 Authenticated\r\n' : '535 Wrong test password\r\n'); continue;
      }
      if (/^(EHLO|HELO) /i.test(line)) {
        if (mode !== 'hang') socket.write('250-loopback.test\r\n250-AUTH LOGIN\r\n250 8BITMIME\r\n');
      } else if (/^AUTH LOGIN/i.test(line)) { auth='username'; socket.write('334 VXNlcm5hbWU6\r\n'); }
      else if (/^MAIL FROM:/i.test(line)) socket.write('250 Sender accepted\r\n');
      else if (/^RCPT TO:/i.test(line)) socket.write(/recipient@example\.test/i.test(line) ? '250 Recipient accepted\r\n' : '550 Test recipient only\r\n');
      else if (/^DATA$/i.test(line)) { data=true; socket.write('354 End with a dot\r\n'); }
      else if (/^QUIT$/i.test(line)) { socket.end('221 Bye\r\n'); }
      else if (/^RSET$/i.test(line)) socket.write('250 Reset\r\n');
      else socket.write('500 Unsupported test command\r\n');
    }
  });
});
(async()=>{
  if (process.platform !== 'win32') throw new Error('This suite requires Windows/XAMPP; do not report it as passing elsewhere.');
  fs.mkdirSync(output,{recursive:true});
  await new Promise((resolve,reject)=>{server.once('error',reject); server.listen(0,'127.0.0.1',resolve);});
  const env = {...process.env, EQUIPIFY_SMTP_HOST:'127.0.0.1',EQUIPIFY_SMTP_PORT:String(server.address().port),
    EQUIPIFY_SMTP_SECURITY:'none',EQUIPIFY_SMTP_USERNAME:username,EQUIPIFY_SMTP_PASSWORD:password,
    EQUIPIFY_MAIL_FROM:'sender@example.test',EQUIPIFY_MAIL_FROM_NAME:'Equipify',
    EQUIPIFY_MAIL_TRANSPORT:'sendmail',EQUIPIFY_MAIL_ENABLE_SEND:'1',
    EQUIPIFY_SENDMAIL_EXE:path.join(profile,'sendmail.exe'),
    EQUIPIFY_MAIL_DIRECTORY:output,EQUIPIFY_MAIL_FALLBACK:'',EQUIPIFY_MAIL_TIMEOUT:'5'};
  try {
    const configured = await run(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',
      path.join(root,'backend/tools/configure_sendmail.ps1'),'-XamppRoot',xampp,'-ProfileDirectory',profile,'-AllowLoopbackTest'],
      {cwd:root,env,windowsHide:true,timeout:30000});
    check(!configured.stdout.includes(password) && !configured.stderr.includes(password),'configurator never prints credentials');
    check(fs.existsSync(path.join(profile,'sendmail.ini')),'private profile has a generated native config');
    check(!fs.readFileSync(path.join(profile,'sendmail.ini'),'utf8').includes('error.log'),'native error logging is disabled');
    async function rejectedProfile(destination, overrides, allowLoopback, expected) {
      try {
        await run(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'backend/tools/configure_sendmail.ps1'),
          '-XamppRoot',xampp,'-ProfileDirectory',destination,...(allowLoopback?['-AllowLoopbackTest']:[])],
          {cwd:root,env:{...env,...overrides},windowsHide:true,timeout:15000});
        throw new Error('Unsafe configuration was accepted.');
      } catch (error) {
        check((error.stderr || '').includes(expected),'unsafe SMTP profile rejected for the expected reason');
        check(!(error.stderr || '').includes(password),'configuration errors do not disclose credentials');
      }
    }
    const rejected = path.join(os.tmpdir(),'equipify-rejected-'+crypto.randomUUID());
    await rejectedProfile(rejected,{},false,'Use tls');
    check(!fs.existsSync(rejected),'unencrypted profile rejected before file creation');
    await rejectedProfile(rejected,{EQUIPIFY_SMTP_PASSWORD:password+'\r\ninjected=yes'},true,'EQUIPIFY_SMTP_PASSWORD');
    check(!fs.existsSync(rejected),'INI injection rejected before file creation');
    const publicProfile = path.join(root,'tmp','forbidden-smtp-'+crypto.randomUUID());
    await rejectedProfile(publicProfile,{},true,'outside the repository');
    check(!fs.existsSync(publicProfile),'web/repository profile rejected before file creation');
    const originalIni=fs.readFileSync(path.join(profile,'sendmail.ini'),'utf8');
    await rejectedProfile(profile,{},true,'must be NEW');
    check(fs.readFileSync(path.join(profile,'sendmail.ini'),'utf8')===originalIni,'existing profile is never overwritten');
    async function send(testMode, overrides={}) {
      const result = await run(php,['-d','disable_functions=mail',path.join(root,'backend/tests/email_transport_case.php'),testMode],
        {cwd:root,env:{...env,...overrides},windowsHide:true,timeout:15000});
      check(result.stderr === '' && !result.stdout.includes(password),'native SMTP diagnostics never reach application output');
      check(!fs.readdirSync(profile).some(name=>name.startsWith('message-')),'transient message input is cleaned');
      return JSON.parse(result.stdout);
    }
    check((await send('templates')).every(Boolean),'all four templates accepted by real sendmail and loopback SMTP');
    check(messages.length===4,'SMTP sink received four distinct messages');
    const expected = ['Agreement verification','Rental request accepted','Payment due','Rental deadline missed'];
    function decodeBody(raw) {
      const body=raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/=\r\n/g,'');
      const bytes=[];
      for(let i=0;i<body.length;i++) {
        if(body[i]==='=' && /^[A-Fa-f0-9]{2}$/.test(body.slice(i+1,i+3))) { bytes.push(parseInt(body.slice(i+1,i+3),16));i+=2; }
        else bytes.push(body.charCodeAt(i));
      }
      return Buffer.from(bytes).toString('utf8');
    }
    messages.forEach((message,i)=>{
      check(message.includes('Subject: '+expected[i]),'template subject survives native SMTP');
      check(message.includes('Content-Transfer-Encoding: quoted-printable'),'MIME transfer encoding survives SMTP');
      check(decodeBody(message).includes('Renée &lt;script&gt;fixture&lt;/script&gt;'),'Unicode and escaped HTML survive SMTP');
      check(decodeBody(message).includes(i===0?'731946':'SMTP-TEST-ONLY'),'expected OTP/reference survives SMTP for this template');
    });
    check((await send('unicode'))[0] === true,'long Unicode subject accepted');
    check(decodeBody(messages.at(-1)).includes('සිංහල / தமிழ் / café ✓'),'multilingual body survives SMTP');
    mode='reject';
    check((await send('unicode'))[0] === false,'SMTP rejection returns false');
    check((await send('unicode',{EQUIPIFY_MAIL_FALLBACK:'file'}))[0] === true,'SMTP rejection follows explicit file fallback');
    check(fs.readdirSync(output).filter(f=>f.endsWith('.eml')).length===1,'fallback writes one message, not an SMTP success claim');
    check((await send('unicode',{EQUIPIFY_SENDMAIL_EXE:path.join(profile,'missing.exe')}))[0]===false,'missing executable fails closed');
    check((await send('unicode',{EQUIPIFY_SENDMAIL_EXE:path.join(profile,'missing.exe'),EQUIPIFY_MAIL_FALLBACK:'file'}))[0]===true,'missing executable follows explicit fallback');
    check(fs.readdirSync(output).filter(f=>f.endsWith('.eml')).length===2,'unavailable native transport saves only the explicit fallback');
    const priorConnections = connections;
    check((await send('unicode',{EQUIPIFY_MAIL_ENABLE_SEND:'0'}))[0]===false,'disabled native transport returns false without fallback');
    check(connections===priorConnections,'disabled native transport makes no SMTP connection');
    mode='hang';
    const start=Date.now();
    check((await send('unicode',{EQUIPIFY_MAIL_TIMEOUT:'1'}))[0]===false,'hung SMTP fails closed');
    check(Date.now()-start<6000,'native timeout is bounded');
    check(!fs.readdirSync(profile).some(name=>/^(debug|error|crash).*\.log$/i.test(name)),'SMTP transcript logs are not generated');
    console.log('PASS: '+checks+' real sendmail/loopback SMTP checks; no Internet delivery attempted.');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,templates:4,internetDelivery:false},null,2));
  } finally {
    sockets.forEach(socket=>socket.destroy()); await new Promise(resolve=>server.close(resolve));
    // Credentials are synthetic, but remove the generated credential file anyway.
    try { fs.unlinkSync(path.join(profile,'sendmail.ini')); } catch {}
  }
})().catch(error=>{ console.error(error.message);process.exitCode=1; });
