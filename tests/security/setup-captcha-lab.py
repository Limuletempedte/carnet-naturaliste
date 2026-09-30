# Prépare un second GoTrue local. Ne modifie ni le serveur Auth initial, ni la production.
import subprocess as sp, json, pathlib, os, sys, shutil
if len(sys.argv) != 2:
    raise SystemExit('Usage : setup-captcha-lab.py /chemin/temporaire/neuf')
root = pathlib.Path(sys.argv[1]).resolve()
root.mkdir(mode=0o700, parents=True, exist_ok=False)
fixture = root / 'captcha-fixture'
fixture.mkdir(mode=0o700)
shutil.copyfile(pathlib.Path(__file__).parent / 'fixtures' / 'captcha-provider.py', fixture / 'server.py')
network = 'cn_security_fixes_20260918'
original = 'supabase_auth_cn_security_fixes_20260918'
def run(args, **kw): return sp.run(args, check=True, **kw)
info = json.loads(sp.check_output(['docker','inspect',original]))[0]
assert network in info['NetworkSettings']['Networks'], 'Laboratoire isolé attendu'
env = dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
assert 'supabase_db_cn_security_fixes_20260918' in env.get('GOTRUE_DB_DATABASE_URL',''), 'Base locale attendue'
run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(fixture/'key.pem'),'-out',str(fixture/'cert.pem'),'-days','2','-subj','/CN=challenges.cloudflare.com','-addext','subjectAltName=DNS:challenges.cloudflare.com'],stdout=sp.DEVNULL,stderr=sp.DEVNULL)
for name in ['cn_captcha_fixture_20260929','cn_captcha_auth_20260929']:
    if sp.run(['docker','inspect',name],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode == 0:
        raise RuntimeError('Un laboratoire CAPTCHA existe déjà : inspecter avant réutilisation.')
run(['docker','run','-d','--name','cn_captcha_fixture_20260929','--network',network,'--network-alias','challenges.cloudflare.com','-v',str(fixture)+':/fixture:ro','python:3.12-alpine','python','/fixture/server.py'],stdout=sp.DEVNULL)
env.update({'GOTRUE_SECURITY_CAPTCHA_ENABLED':'true','GOTRUE_SECURITY_CAPTCHA_PROVIDER':'turnstile','GOTRUE_SECURITY_CAPTCHA_SECRET':'local-fixture-only','GOTRUE_PASSWORD_MIN_LENGTH':'12','GOTRUE_API_HOST':'0.0.0.0','API_EXTERNAL_URL':'http://127.0.0.1:55431/auth/v1','GOTRUE_SITE_URL':'http://127.0.0.1:55430','GOTRUE_URI_ALLOW_LIST':'http://127.0.0.1:55430','SSL_CERT_FILE':'/fixture/cert.pem','SSL_CERT_DIR':'/fixture'})
for kind in ['INVITE', 'CONFIRMATION', 'RECOVERY', 'EMAIL_CHANGE']:
    env['GOTRUE_MAILER_URLPATHS_' + kind] = 'http://127.0.0.1:55431/auth/v1/verify'
env_path = root / 'captcha-auth.env'
with env_path.open('x') as f:
    os.chmod(env_path,0o600)
    f.write('\n'.join(k+'='+v for k,v in env.items())+'\n')
try:
    run(['docker','run','-d','--name','cn_captcha_auth_20260929','--network',network,'--env-file',str(env_path),'-p','127.0.0.1:55432:9999','-v',str(fixture/'cert.pem')+':/fixture/cert.pem:ro',info['Config']['Image']],stdout=sp.DEVNULL)
finally:
    env_path.unlink(missing_ok=True)
print('Laboratoire CAPTCHA séparé créé : Auth 127.0.0.1:55432, vérification HTTPS simulée uniquement sur le réseau Docker local. Auth original inchangé.')
