# WhatsApp Bot API

API em Node.js para enviar mensagens de texto e imagens para grupos pelo WhatsApp Web. O projeto foi preparado para Windows e Linux.

## Requisitos

- Node.js 22 LTS ou 24 LTS. A biblioteca `whatsapp-web.js` exige Node.js 18 ou superior; este projeto recomenda uma versão LTS ainda suportada.
- Acesso à internet na instalação das dependências e na conexão com o WhatsApp Web.

O Puppeteer baixa uma versão compatível do Chrome durante a instalação. Se quiser usar um Chrome/Chromium já instalado, configure `CHROME_PATH` no `.env`.

## Instalação

Clone o repositório e entre na pasta do projeto.

### Windows (PowerShell)

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm start
```

### Linux

```bash
cp .env.example .env
nano .env
npm install
npm start
```

Configure `API_TOKEN` no `.env` antes de iniciar. Use o mesmo valor no cliente que chama esta API. Para criar um token aleatório, rode em qualquer terminal com Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Na primeira execução, escaneie o QR Code exibido no terminal. A sessão local é salva em `.wwebjs_auth/` no diretório de onde o comando foi iniciado. Execute `npm start` a partir da pasta do projeto para manter `.env` e a sessão no local esperado.

A API só começa a escutar depois que o cliente WhatsApp emitir o evento `ready`. A porta padrão é `3241`; altere com `API_PORT_WHATSAPP` se necessário.

## Uso da API

A API aceita requisições em `http://HOST:3241/` e exige o cabeçalho `x-api-token`.

- `GET /`: retorna o status da API e da conexão com o WhatsApp.
- `POST /`: envia uma mensagem. Envie JSON com `groupId`, `message` e `tipo`.
  - `tipo: 2` envia texto.
  - `tipo: 1` envia uma imagem com legenda; informe também `imagePath`, que deve apontar para um arquivo acessível no computador que executa esta API.

Exemplo de corpo JSON para texto:

```json
{
  "groupId": "ID_DO_GRUPO@g.us",
  "message": "Mensagem de exemplo",
  "tipo": 2
}
```

O servidor escuta em todas as interfaces, mas aceita chamadas somente de endereços IPv4 privados (`10.x.x.x`, `172.16.x.x` a `172.31.x.x` e `192.168.x.x`) e valida o token. Configure o firewall do Windows/Linux para liberar a porta apenas para a rede/VPN que precisa acessar a API.

## Configuração do Chrome

Normalmente não é necessário configurar `CHROME_PATH`: o Puppeteer usa a versão do Chrome instalada junto às dependências. Para usar uma instalação do sistema, defina no `.env` o caminho completo do executável, por exemplo:

```dotenv
CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
```

No Linux, use o caminho do Chrome/Chromium instalado, por exemplo `/usr/bin/google-chrome`.

## Dados locais e segurança

Nunca publique `.env`, `.wwebjs_auth/`, `.wwebjs_cache/`, `logs/` ou `data/`. A pasta `.wwebjs_auth/` contém a sessão autenticada do WhatsApp. Esses caminhos já estão no `.gitignore`; o `.env.example` contém apenas valores fictícios.

A API foi feita para uma rede confiável ou VPN privada. Não exponha a porta diretamente à internet.
