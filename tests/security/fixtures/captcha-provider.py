# Fournisseur factice, uniquement sur le réseau Docker de test. Ne jamais déployer.
import http.server, ssl, json, urllib.parse
used = set()
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 16384: self.send_error(413); return
        data = urllib.parse.parse_qs(self.rfile.read(length).decode())
        token = data.get('response', [''])[0]
        ok = data.get('secret') == ['local-fixture-only'] and token.startswith('valid-') and token not in used
        if ok: used.add(token)
        body = json.dumps({'success': ok, 'hostname': 'carnet-naturaliste.vercel.app', 'error-codes': [] if ok else ['invalid-input-response']}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
server = http.server.HTTPServer(('0.0.0.0', 443), Handler)
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain('/fixture/cert.pem', '/fixture/key.pem')
server.socket = tls.wrap_socket(server.socket, server_side=True)
server.serve_forever()
