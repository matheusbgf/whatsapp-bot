const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Carrega variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '.env') });

// Configurações de segurança
const API_TOKEN = process.env.API_TOKEN || crypto.randomBytes(32).toString('hex');
const requestLog = {};

// Se o token foi gerado automaticamente, mostra para o usuário
if (!process.env.API_TOKEN) {
    console.log('⚠️ Nenhum token API configurado no arquivo .env');
    console.log(`🔑 Token gerado automaticamente: ${API_TOKEN}`);
    console.log('📌 Recomendamos adicionar este token ao seu arquivo .env como API_TOKEN');
}

// Função para encontrar o executável do Chrome
function findChrome() {
    const configuredPath = process.env.CHROME_PATH;
    if (configuredPath) {
        const resolvedPath = path.resolve(configuredPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Chrome indicado em CHROME_PATH não encontrado: ${resolvedPath}`);
        }
        return resolvedPath;
    }

    const possiblePaths = [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
    ].filter(Boolean);

    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`🌐 Navegador encontrado em: ${chromePath}`);
            return chromePath;
        }
    }

    console.log('🌐 Nenhum Chrome do sistema encontrado; o Puppeteer usará o navegador instalado com as dependências.');
    return null;
}

// Configuração portátil do Puppeteer; os argumentos padrão preservam o sandbox do Chrome
const puppeteerConfig = { headless: true };

// Tenta encontrar o Chrome instalado
const chromePath = findChrome();
if (chromePath) {
    puppeteerConfig.executablePath = chromePath;
}

// Inicializa o cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// Evento de geração de QR Code
client.on('qr', (qr) => {
    console.log('📱 QR Code gerado. Escaneie com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// Evento de autenticação
client.on('authenticated', () => {
    console.log('✅ Autenticado com sucesso!');
});

// Evento de pronto
client.on('ready', () => {
    console.log('🚀 Cliente WhatsApp está pronto e conectado!');
    startServer();
});

// Evento de desconexão
client.on('disconnected', (reason) => {
    console.log('❌ Cliente desconectado:', reason);
});

// Envia texto diretamente usando o Chat interno do WhatsApp Web.
// Evita Client.getChats(), Client.getChatById() e Message.reply().
async function sendTextDirect(chatId, text) {
    return client.pupPage.evaluate(
        async (chatId, text) => {
            const { createWid } =
                window.require('WAWebWidFactory');

            const { Chat } =
                window.require('WAWebCollections');

            const chatWid = createWid(chatId);

            let chat = Chat.get(chatWid);

            if (!chat) {
                try {
                    const result =
                        await window
                            .require('WAWebFindChatAction')
                            .findOrCreateLatestChat(chatWid);

                    chat = result?.chat || null;
                } catch {
                    chat = null;
                }
            }

            if (!chat) {
                return {
                    success: false,
                    reason: 'CHAT_NOT_FOUND',
                };
            }

            await window.WWebJS.sendMessage(
                chat,
                text,
                {
                    linkPreview: false,
                    parseVCards: false,
                    waitUntilMsgSent: true,
                }
            );

            return {
                success: true,
            };
        },
        chatId,
        text
    );
}

// Comando /grupos
client.on('message', async (message) => {
    try {
        const texto =
            (message.body || '')
                .trim()
                .toLowerCase();

        if (texto !== '/grupos') {
            return;
        }

        console.log(
            '📋 /grupos recebido de:',
            message.from
        );

        const isGroupMessage =
            typeof message.from === 'string' &&
            message.from.endsWith('@g.us');

        console.log(
            '📋 Mensagem veio de grupo:',
            isGroupMessage
        );

        if (isGroupMessage) {
            const result = await sendTextDirect(
                message.from,
                '❌ O comando /grupos só pode ser usado no privado.'
            );

            if (!result.success) {
                throw new Error(
                    'Não foi possível responder ao chat de origem.'
                );
            }

            return;
        }

        console.log(
            '📋 Obtendo grupos diretamente da coleção interna...'
        );

        const grupos =
            await client.pupPage.evaluate(() => {
                const { Chat } =
                    window.require('WAWebCollections');

                const chats =
                    Chat.getModelsArray();

                return chats
                    .map((chat) => {
                        try {
                            const id =
                                chat?.id?._serialized ||
                                chat?.id?.$1 ||
                                null;

                            if (
                                !id ||
                                !id.endsWith('@g.us')
                            ) {
                                return null;
                            }

                            let name = '';

                            try {
                                name =
                                    chat.formattedTitle ||
                                    '';
                            } catch {}

                            return {
                                id,
                                name,
                            };
                        } catch {
                            return null;
                        }
                    })
                    .filter(Boolean)
                    .sort((a, b) =>
                        a.name.localeCompare(
                            b.name,
                            'pt-BR',
                            {
                                sensitivity: 'base',
                            }
                        )
                    );
            });

        console.log(
            '📋 Grupos encontrados:',
            grupos.length
        );

        if (grupos.length === 0) {
            const result = await sendTextDirect(
                message.from,
                '⚠️ Nenhum grupo encontrado.'
            );

            if (!result.success) {
                throw new Error(
                    'Não foi possível enviar a resposta.'
                );
            }

            return;
        }

        const linhas = grupos.map(
            (grupo, index) =>
                `${index + 1}. ${grupo.name}\nID: ${grupo.id}\n\n`
        );

        const tamanhoMaximo = 3500;
        const partes = [];
        let parteAtual = '';

        for (const linha of linhas) {
            if (
                parteAtual &&
                (parteAtual + linha).length >
                    tamanhoMaximo
            ) {
                partes.push(parteAtual);
                parteAtual = '';
            }

            parteAtual += linha;
        }

        if (parteAtual) {
            partes.push(parteAtual);
        }

        for (
            let i = 0;
            i < partes.length;
            i++
        ) {
            const textoParte =
                `📋 Lista de grupos (${i + 1}/${partes.length})\n\n` +
                partes[i];

            const result =
                await sendTextDirect(
                    message.from,
                    textoParte
                );

            if (!result.success) {
                throw new Error(
                    `Falha ao enviar a parte ${i + 1} da lista.`
                );
            }
        }

        console.log(
            `📋 Lista de grupos enviada para ${message.from}`
        );
    } catch (error) {
        console.error(
            '❌ Erro ao listar grupos:',
            error
        );

        try {
            const result =
                await sendTextDirect(
                    message.from,
                    '❌ Erro ao obter a lista de grupos.'
                );

            if (!result.success) {
                console.error(
                    '❌ Não foi possível enviar a mensagem de erro.'
                );
            }
        } catch (replyError) {
            console.error(
                '❌ Falha adicional ao responder:',
                replyError
            );
        }
    }
});

// Inicializa o cliente
console.log('🔄 Inicializando cliente WhatsApp...');
client.initialize().catch(err => {
    console.error('❌ Erro ao inicializar o cliente WhatsApp:', err);
    console.log('📌 Dicas para resolver:');
    console.log('1. Execute: npm install');
    console.log('2. Instale o Chrome: sudo apt-get install google-chrome-stable');
    console.log('3. Ou instale o Chromium: sudo apt-get install chromium-browser');
    process.exit(1);
});

// Função para verificar se a requisição vem de localhost, rede local ou Docker
function isLocalRequest(req) {
    const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');

    // Localhost
    if (
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === 'localhost'
    ) {
        return true;
    }

    // Rede local 192.168.x.x
    if (ip.startsWith('192.168.')) {
        return true;
    }

    // Rede privada 10.x.x.x
    if (ip.startsWith('10.')) {
        return true;
    }

    // Faixa Docker padrão e redes privadas 172.16.x.x até 172.31.x.x
    const parts = ip.split('.');
    if (
        parts.length === 4 &&
        parts[0] === '172'
    ) {
        const secondOctet = parseInt(parts[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) {
            return true;
        }
    }

    return false;
}

// Registra uma tentativa de acesso não autorizada
function logSecurityEvent(type, ip, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        ip,
        details
    };

    console.error(`🚨 [SEGURANÇA] ${type} - IP: ${ip} - ${details}`);

    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(
        path.join(logDir, 'security.log'),
        JSON.stringify(logEntry) + '\n'
    );
}

// Função para processar as requisições da API
function startServer() {
    const server = http.createServer((req, res) => {
        // Adiciona cabeçalhos de segurança antes de qualquer resposta
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        res.setHeader('Server', 'WhatsApp API');

        const clientIp = (req.socket.remoteAddress || '').replace('::ffff:', '');

        // Verifica se a requisição é local
        if (!isLocalRequest(req)) {
            logSecurityEvent('ACESSO_REMOTO_BLOQUEADO', clientIp, 'Tentativa de acesso de IP não local');
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            // Verifica o token de autenticação
            const authToken = req.headers['x-api-token'] || '';

            if (authToken !== API_TOKEN) {
                logSecurityEvent('TOKEN_INVÁLIDO', clientIp, 'Token de API inválido ou ausente');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Token de autenticação inválido'
                }));
                return;
            }

            let size = 0;
            const MAX_SIZE = 1 * 1024 * 1024; // 1MB
            let body = '';

            req.on('data', chunk => {
                size += chunk.length;

                if (size > MAX_SIZE) {
                    logSecurityEvent('TAMANHO_EXCEDIDO', clientIp, 'Corpo da requisição muito grande');
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Corpo da requisição muito grande'
                    }));
                    req.destroy();
                } else {
                    body += chunk.toString();
                }
            });

            req.on('end', async () => {
                if (size > MAX_SIZE) return;

                try {
                    let data;

                    try {
                        data = JSON.parse(body);
                    } catch (e) {
                        throw new Error('JSON inválido');
                    }

                    console.log(`📥 Requisição recebida de ${clientIp}`);

                    // Valida os dados recebidos
                    if (!data.groupId) {
                        throw new Error('ID do grupo não fornecido');
                    }

                    if (!data.message) {
                        throw new Error('Mensagem não fornecida');
                    }

                    // Converte tipo para número
                    data.tipo = Number(data.tipo);

                    // Tipo 1: Checkpoint (com imagem)
                    // Tipo 2: Alertas (apenas texto)
                    if (![1, 2].includes(data.tipo)) {
                        throw new Error('Tipo de envio inválido (deve ser 1 para checkpoint ou 2 para alertas)');
                    }

                    // Envia a mensagem
                    if (data.tipo === 1) {
                        if (!data.imagePath) {
                            throw new Error('Caminho da imagem não fornecido para tipo checkpoint');
                        }

                        if (!fs.existsSync(data.imagePath)) {
                            throw new Error(`Imagem não encontrada: ${data.imagePath}`);
                        }

                        const media = MessageMedia.fromFilePath(data.imagePath);

                        await client.sendMessage(data.groupId, media, {
                            caption: data.message
                        });

                        console.log(`✅ Checkpoint enviado para ${data.groupId}`);
                    } else {
                        await client.sendMessage(data.groupId, data.message);
                        console.log(`✅ Alerta enviado para ${data.groupId}`);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Mensagem enviada com sucesso',
                        timestamp: new Date().toISOString()
                    }));

                } catch (error) {
                    console.error('❌ Erro ao processar requisição:', error);

                    logSecurityEvent(
                        'ERRO_PROCESSAMENTO',
                        clientIp,
                        `Erro: ${error.message}`
                    );

                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }));
                }
            });

        } else if (req.method === 'GET') {
            // Verifica o token para requisições GET de status também
            const authToken = req.headers['x-api-token'] || '';

            if (authToken !== API_TOKEN) {
                logSecurityEvent(
                    'TOKEN_INVÁLIDO_STATUS',
                    clientIp,
                    'Token inválido em requisição de status'
                );

                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Token de autenticação inválido'
                }));
                return;
            }

            // Para requisições GET, retorna informação sobre o status
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                status: 'online',
                whatsapp: client.info ? 'connected' : 'disconnected',
                timestamp: new Date().toISOString(),
                server: {
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage().rss / 1024 / 1024 + ' MB'
                }
            }));

        } else {
            logSecurityEvent(
                'MÉTODO_NÃO_PERMITIDO',
                clientIp,
                `Método: ${req.method}`
            );

            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Método não permitido'
            }));
        }
    });

    // Define a porta em que o servidor irá escutar
    const PORT = process.env.API_PORT_WHATSAPP || 3241;
    const HOST = '0.0.0.0'; // Permite localhost, Docker e rede local

    server.listen(PORT, HOST, () => {
        console.log(`🚀 API WhatsApp rodando em ${HOST}:${PORT} (localhost, Docker e rede local)`);
        console.log('🔒 Segurança: Verificação de tokens ativada');
        console.log('🚦 Limite de requisições: Desativado');
    });
}

// Captura erros não tratados
process.on('uncaughtException', (err) => {
    console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promessa rejeitada não tratada:', reason);
});
