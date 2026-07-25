import { Buffer } from 'node:buffer';

import FormData from 'form-data';
import fetch from 'node-fetch';

export const info = {
    id: 'comic-orb',
    name: 'Comic Orb Relay',
    version: '1.24.0',
    description: 'Restricted OpenAI-compatible text and long-running image relay for the Comic Orb extension.',
};

const BLOCKED_PROVIDER_HEADERS = /^(?:authorization|content-type|content-length|host|connection|transfer-encoding|x-comic-orb-api-key)$/i;
const BLOCKED_IMAGE_HEADERS = /^(?:authorization|content-type|content-length|host|connection|transfer-encoding)$/i;
const ALLOWED_PROVIDER_PATH = /\/(?:models|chat\/completions|responses|models\/[^/]+:generateContent)\/?$/i;

function parseHttpUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        return /^https?:$/i.test(parsed.protocol) ? parsed : null;
    } catch {
        return null;
    }
}

function filteredHeaders(value, blockedPattern) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key]) => !blockedPattern.test(key)));
}

function attachClientAbort(request, response, controller) {
    let disconnected = false;
    const abort = () => {
        if (response.writableEnded || controller.signal.aborted) return;
        disconnected = true;
        controller.abort(new Error('Comic Orb client canceled the upstream request'));
    };
    request.once('aborted', abort);
    response.once('close', abort);
    return {
        disconnected: () => disconnected,
        detach: () => {
            request.off('aborted', abort);
            response.off('close', abort);
        },
    };
}

async function sendUpstreamResponse(result, response, includeRequestId = false) {
    const buffer = Buffer.from(await result.arrayBuffer());
    response.status(result.status);
    response.setHeader('Content-Type', result.headers.get('content-type') || 'application/json');
    if (includeRequestId) {
        const requestId = result.headers.get('x-request-id') || result.headers.get('x-tt-logid');
        if (requestId) response.setHeader('X-Comic-Orb-Upstream-Request-Id', requestId);
    }
    return response.send(buffer);
}

export async function init(router) {
    router.get('/status', (_request, response) => {
        return response.json({
            ready: true,
            service: 'comic-orb-server-plugin',
            version: info.version,
            provider_api_relay: true,
            default_timeout_seconds: 600,
            max_timeout_seconds: 1800,
            client_cancel_propagates: true,
        });
    });

    router.post('/provider', async (request, response) => {
        const controller = new AbortController();
        const client = attachClientAbort(request, response, controller);
        let timer;
        let timeoutSeconds = 600;
        try {
            const endpoint = parseHttpUrl(request.body?.provider_endpoint);
            const method = String(request.body?.method || 'POST').toUpperCase();
            timeoutSeconds = Math.max(10, Math.min(1800, Number(request.body?.timeout_seconds) || 600));
            if (!['GET', 'POST'].includes(method)) {
                return response.status(400).json({ error: { message: 'Comic Orb provider relay only supports GET and POST' } });
            }
            if (!endpoint) {
                return response.status(400).json({ error: { message: 'Invalid Comic Orb provider endpoint' } });
            }
            if (!ALLOWED_PROVIDER_PATH.test(endpoint.pathname)) {
                return response.status(400).json({ error: { message: 'Provider endpoint is not an allowed models, chat, responses, or generateContent route' } });
            }

            const headers = filteredHeaders(request.body?.headers, BLOCKED_PROVIDER_HEADERS);
            const apiKey = String(request.get('X-Comic-Orb-Api-Key') || '');
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
            const options = { method, headers, signal: controller.signal };
            if (method === 'POST') {
                headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(request.body?.body ?? {});
            }

            timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
            const result = await fetch(endpoint, options);
            clearTimeout(timer);
            timer = undefined;
            return await sendUpstreamResponse(result, response, true);
        } catch (error) {
            if (client.disconnected() || response.destroyed) return;
            if (controller.signal.aborted || error?.name === 'AbortError') {
                return response.status(504).json({ error: { message: `Provider exceeded the configured ${timeoutSeconds}-second relay timeout` } });
            }
            console.error('[comic-orb] Provider relay failed', error);
            return response.status(502).json({ error: { message: error?.message || 'Provider relay failed' } });
        } finally {
            if (timer) clearTimeout(timer);
            client.detach();
        }
    });

    router.post('/image', async (request, response) => {
        const controller = new AbortController();
        const client = attachClientAbort(request, response, controller);
        let timer;
        let timeoutSeconds = 600;
        try {
            const endpoint = parseHttpUrl(request.body?.provider_endpoint);
            const protocol = request.body?.protocol === 'edits' ? 'edits' : 'generations';
            timeoutSeconds = Math.max(60, Math.min(1800, Number(request.body?.timeout_seconds) || 600));
            if (!endpoint) {
                return response.status(400).json({ error: { message: 'Invalid Comic Orb image provider endpoint' } });
            }
            if (!new RegExp(`/images/${protocol}/?$`, 'i').test(endpoint.pathname)) {
                return response.status(400).json({ error: { message: `Endpoint does not match images/${protocol}` } });
            }

            const fields = request.body?.fields && typeof request.body.fields === 'object' && !Array.isArray(request.body.fields) ? request.body.fields : {};
            const references = Array.isArray(request.body?.references) ? request.body.references.slice(0, 4) : [];
            const headers = filteredHeaders(request.body?.headers, BLOCKED_IMAGE_HEADERS);
            const apiKey = String(request.get('X-Comic-Orb-Api-Key') || '');
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

            let body;
            if (protocol === 'edits') {
                const formData = new FormData();
                for (const [key, value] of Object.entries(fields)) {
                    if (value === undefined || value === null || value === '') continue;
                    formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
                }
                for (const [index, reference] of references.entries()) {
                    const match = String(reference?.dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/s);
                    if (!match || !match[1].startsWith('image/')) {
                        return response.status(400).json({ error: { message: `Reference image ${index + 1} is invalid` } });
                    }
                    formData.append('image[]', Buffer.from(match[2], 'base64'), {
                        filename: String(reference?.name || `reference-${index + 1}.png`),
                        contentType: match[1],
                    });
                }
                if (!references.length) {
                    return response.status(400).json({ error: { message: 'Edits protocol requires at least one reference image' } });
                }
                Object.assign(headers, formData.getHeaders());
                body = formData;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(fields);
            }

            timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
            const result = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal });
            clearTimeout(timer);
            timer = undefined;
            return await sendUpstreamResponse(result, response);
        } catch (error) {
            if (client.disconnected() || response.destroyed) return;
            if (controller.signal.aborted || error?.name === 'AbortError') {
                return response.status(504).json({ error: { message: `Image provider exceeded the configured ${timeoutSeconds}-second relay timeout` } });
            }
            console.error('[comic-orb] Image relay failed', error);
            return response.status(502).json({ error: { message: error?.message || 'Image relay failed' } });
        } finally {
            if (timer) clearTimeout(timer);
            client.detach();
        }
    });
}
