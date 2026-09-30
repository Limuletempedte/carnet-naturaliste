// Simulation réservée aux tests locaux ; le vrai fournisseur reste nécessaire en production.
export const captchaWidgetScript = `window.turnstile = {
    render(el, options) {
        const id = crypto.randomUUID();
        window.fixtureCaptcha = options;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Valider le CAPTCHA de test';
        button.onclick = () => options.callback('valid-' + crypto.randomUUID()); el.append(button);
        const frame = document.createElement('iframe'); frame.title = 'Cadre CAPTCHA de test'; frame.src = 'https://challenges.cloudflare.com/test-frame'; el.append(frame);
        window.fixtureContainers ??= new Map(); window.fixtureContainers.set(id, el); return id;
    },
    remove(id) { window.fixtureContainers.get(id)?.replaceChildren(); window.fixtureContainers.delete(id); }
};`;

export async function installCaptchaFixture(context) {
    await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route =>
        route.fulfill({ contentType: 'application/javascript', body: captchaWidgetScript }));
    await context.route('https://challenges.cloudflare.com/test-frame', route =>
        route.fulfill({ contentType: 'text/html', body: '<p>Cadre de test local</p>' }));
}
